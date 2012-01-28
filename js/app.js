L.Handler.CtrlClickQuery = L.Handler.extend({
	initialize: function(map) {
		this._map = map;
		this._container = map._container;
	},

    enable: function() {
		if (this._enabled) { return; }
		L.DomEvent.addListener(this._container, 'mouseup', this._onMouseUp, this);
		this._enabled = true;
	},

	disable: function() {
		if (!this._enabled) { return; }
		L.DomEvent.removeListener(this._container, 'mouseup', this._onMouseUp, this);
		this._enabled = false;
	},

	_onMouseUp: function(e) {

		if (!e.ctrlKey) { return false; }
        var latlng = this._map.mouseEventToLatLng(e);

        App.searchByLatLng(latlng.lat,latlng.lng);

	}
});


var App = (function() {

    // conf options
    var serviceURL = 'http://localhost:5000/articles';
    var proxyURL = '';


    var formatLink = function(string){
        return encodeURIComponent(string.replace(" ","_","g"));
    }

    var getPopupContent = function(properties){
        return '<img src="img/icon_wiki.png" alt="Wikipedia article" />' +
               '<a href="http://en.wikipedia.org/wiki/' + formatLink(properties.title) +
               '" target="_blank" title="Wikipedia article for "' + properties.title + '">'
               + properties.title + '</a>'
    }

    return {

        settings: {
            showPreviousArticles: true,
            showLinkedLines: true
        },

        map: null,

        articles: null,

        lines: null,

        linkedArticles: null,

        linkedLines: null,

        currentArticle: null,

        getURL:function(offset,params){
            if (!serviceURL)
                return False;

            var url = serviceURL;

            if (offset && !(url.substring(url.length-1,url.length) == '/'))
                url += '/';

            if (offset)
                url += offset;

            if (params)
                url += '?' + $.param(params);

            if (proxyURL)
                url = proxyURL + escape(url);

            return url;
        },

        search: function(text){
            if (text.length > 3){
                var offset = "";
                var params = {
                    title__ilike: "%" + text + "%",
                    attrs:"id,title,links_count",
                    queryable:"title",
                    order_by:"links_count",
                    dir:"desc",
                    limit:"30"
                };

                $.get(this.getURL(offset,params),function(data){

                    var resultsDiv = $("#search-results");
                    resultsDiv.empty().show();

                    if (data && data.features.length){
                        var div, title, result;
                        var re = new RegExp(text,"gi");
                        for (var i = 0; i < data.features.length; i++){
                            title = data.features[i].properties.title;
                            result = title.replace(re, function(m){
                                        return "<strong>" + m + "</strong>"
                                     }) + " (" + data.features[i].properties.links_count + ")";

                            div = $("<div></div>").append(result);
                            div.click({"feature": data.features[i]},function(e){
                                $("#search").val($(this).text());
                                resultsDiv.empty().hide();
                                App.clear();
                                App.addArticle(e.data.feature);
                                App.getLinkedArticles(e.data.feature.id);
                            });
                            resultsDiv.append(div);
                        }
                    } else {
                        resultsDiv.append("<div class=\"no-results\">No results found</a>");
                    }
                });
            }
        },

        searchByLatLng: function(lat,lng){

            $("#map").css("cursor", "wait");

            var zoom = App.map.getZoom() || 1;
            var tolerance = 1 / zoom;

            var offset = "";
            var params = {
                lat: lat,
                lon: lng,
                tolerance: tolerance,
                attrs:"id,title,links_count",
                order_by:"links_count",
                dir:"desc",
                limit:"30"
            };

            $.get(this.getURL(offset,params),function(data){

                var resultsDiv = $("<div></div>");
                resultsDiv.addClass("results");
                if (data && data.features.length){
                    var div, title, results;
                    for (var i = 0; i < data.features.length; i++){
                        title = data.features[i].properties.title;

                        result = title + " (" + data.features[i].properties.links_count + ")";

                        div = $("<div></div>").append(result);
                        div.click({"feature": data.features[i]},function(e){
                            App.map.closePopup();
                            App.clear();
                            App.addArticle(e.data.feature);
                            App.getLinkedArticles(e.data.feature.id);
                        });
                        resultsDiv.append(div);
                    }

                } else {
                    resultsDiv.append("No articles found near this point");
                }

                var popup = new L.Popup();
                popup.setLatLng(new L.LatLng(lat,lng));
                // We need the actual DOM object
                popup.setContent(resultsDiv.get(0));

                App.map.openPopup(popup);
                $("#map").css("cursor", "default");

            });

        },

        getArticle: function(id,random){

            var offset = id + '.json';

            $.getJSON(this.getURL(offset),function(data){
                if (data){
                    if (data.properties.links_count == 0){
                        if (random){
                            // Keep looking for an article with links
                            App.randomArticle();
                        } else {
                            alert('Sorry, no links for this article');
                        }
                    } else {
                        App.addArticle(data);
                        App.getLinkedArticles(id);
                    }
                } else {
                    alert('No data received');
                }

            });

        },

        clear: function(){
            App.articles.clearLayers();
            App.lines.clearLayers();
            App.linkedArticles.clearLayers();
            App.linkedLines.clearLayers();

            App.map.closePopup();

            App.currentArticle = null;

        },

        randomArticle: function(){
            App.clear();
            var id = Math.round(365000 - 365000 * Math.random());
            App.getArticle(id,true);
        },

        getLinkedArticles: function(id){
            var offset = id + '/linked';

            $.getJSON(this.getURL(offset),function(data){
                if (!data || data.length == 0){
                    alert("Sorry, no links for this article");
                    return;
                }


                var bounds = new L.LatLngBounds();

                // Rebuild lines first so they appear under the markers
                App.linkedLines.clearLayers();

                for (var i = 0; i < data.features.length; i++){
                    var feature = data.features[i];

                    if (App.settings.showLinkedLines){
                        var line = new L.Polyline([
                                        new L.LatLng(App.currentArticle.geometry.coordinates[1],App.currentArticle.geometry.coordinates[0]),
                                        new L.LatLng(feature.geometry.coordinates[1],feature.geometry.coordinates[0])]);
                        App.linkedLines.addLayer(line);
                    }

                    // Hack: linkedArticles does not have a getBounds method!
                    bounds.extend(new L.LatLng(feature.geometry.coordinates[1],feature.geometry.coordinates[0]));
                }

                if (App.settings.showLinkedLines){
                    App.linkedLines.setStyle({weight:2, color: "gray",clickable: false});
                }

                App.linkedArticles.clearLayers();
                App.linkedArticles.addGeoJSON(data);

                // Make sure current article is shown in the bounds
                bounds.extend(new L.LatLng(App.currentArticle.geometry.coordinates[1],App.currentArticle.geometry.coordinates[0]));

                App.map.fitBounds(bounds);
            });

        },

        addArticle: function(feature){
            var showPrevious = App.settings.showPreviousArticles;

            if (!showPrevious){
                App.articles.clearLayers();
                App.lines.clearLayers();
            }
            // Add feature to articles layer
            App.articles.addGeoJSON(feature);


            // Add line
            if (showPrevious && App.currentArticle){
                var line = new L.Polyline([ new L.LatLng(App.currentArticle.geometry.coordinates[1],App.currentArticle.geometry.coordinates[0]),
                                        new L.LatLng(feature.geometry.coordinates[1],feature.geometry.coordinates[0])]);
                App.lines.addLayer(line);
                App.lines.setStyle({weight:4, color: "red",clickable: false});
            }

            App.currentArticle = feature;
        },

        setup: function(){

            // Setup events
            $("#search").keyup(function(e){
                App.search(e.target.value);
            });

            $("#clear").click(App.clear);
            $("#random").click(App.randomArticle);

            $("#show-previous-articles").click(function(){
                App.settings.showPreviousArticles = !App.settings.showPreviousArticles;
            });
            $("#show-linked-lines").click(function(){
                App.settings.showLinkedLines = !App.settings.showLinkedLines;
            });


            // Set map div size
            $("#map").width($(window).width());
            $("#map").height($(window).height());

            // Leaflet setup
            this.setupMap();


            this.getArticle('31862');

       },

        setupMap: function(){

            this.map = new L.Map('map');

            // MapQuest OpenStreetMap base map
            var osmUrl = "http://otile{s}.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png";
            var osmAttribution = 'Map data &copy; 2011 OpenStreetMap contributors, Tiles Courtesy of <a href="http://www.mapquest.com/" target="_blank">MapQuest</a> <img src="http://developer.mapquest.com/content/osm/mq_logo.png">';
            var osm = new L.TileLayer(osmUrl, {maxZoom: 18, attribution: osmAttribution ,subdomains: '1234'});
            this.map.addLayer(osm);

            this.lines = new L.MultiPolyline([]);
            this.map.addLayer(this.lines);

            this.linkedLines = new L.MultiPolyline([]);
            this.map.addLayer(this.linkedLines);


            var articlesIcon = L.Icon.extend({
                iconUrl: 'img/icon_wiki.png',
                shadowUrl: 'img/icon_wiki_shadow.png',
                iconSize: new L.Point(20, 20),
                shadowSize: new L.Point(27, 27),
                iconAnchor: new L.Point(10, 10),
                popupAnchor: new L.Point(0, 0)
            });

            this.articles = new L.GeoJSON(null,{
                pointToLayer: function (latlng) {
                    return new L.Marker(latlng, {
                        icon: new articlesIcon()
                    });

                }
            });

            this.articles.on('featureparse', function(e) {
                if (e.properties){
                   (function(properties) {
                        var popup = new L.Popup({offset: new L.Point(0,-4)});
                        popup.setLatLng(e.layer.getLatLng());
                        popup.setContent(getPopupContent(properties));

                        e.layer.on("mouseover", function (e) {
                            App.map.closePopup();
                            App.map.openPopup(popup);
                        });

                   })(e.properties);

               }
            });


            this.map.addLayer(this.articles);

            var linkedArticlesMarkerOptions = {
                radius: 5,
                color: "gray",
                weight: 2,
                opacity: 1,
                fillOpacity: 1
            };

            this.linkedArticles = new L.GeoJSON(null,{
                pointToLayer: function (latlng) {
                    return new L.CircleMarker(latlng, linkedArticlesMarkerOptions);
                }
            });
            this.linkedArticles.on('featureparse', function(e) {
                if (e.properties){
                   var id = e.id;
                   (function(properties) {
                        var color = (properties.links_count != 0) ? "#82E058" :"#E84D4D";
                        e.layer.setStyle({fillColor: color});
                        var popup = new L.Popup({offset: new L.Point(0,-4)});
                        // Hack: When using CircleMarker there is no way to get the coordinates
                        // of the added geometry (e.layer.getLatLng() does not work), so we use
                        // the bbox
                        popup.setLatLng(new L.LatLng(e.bbox[1],e.bbox[0]))
                        popup.setContent(getPopupContent(properties));

                        e.layer.on("mouseover", function (e) {
                            App.map.closePopup()
                            App.map.openPopup(popup)

                        });

                        e.layer.on("click", function (e) {
                            App.getArticle(id);
                        });

                   })(e.properties);

               }
            });


            this.map.addLayer(this.linkedArticles);

            var pointQuery = new L.Handler.CtrlClickQuery(this.map);
            pointQuery.enable()

            this.map.setView(new L.LatLng(0, 0), 1);

        }
    }
})()


$("document").ready(function(){
        App.setup()
});


