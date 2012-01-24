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
    //
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
            showPreviousArticles: true
        },

        map: null,

        articles: null,

        lines: null,

        linkedArticles: null,

        linkedLines: null,

        currentArticle: null,

        search: function(text){
            if (text.length > 3){
                var url = 'http://127.0.0.1:5000/articles';
                url += "?title__ilike=%" + text + "%";
                url += "&attrs=id,title,links_count";
                url += "&queryable=title";
                url += "&order_by=links_count";
                url += "&dir=desc";
                url += "&limit=30";
                url = "proxy.php?url="+escape(url);

                $.get(url,function(data){

                    var resultsDiv = $("#search-results");
                    if (data && data.features.length){
                        resultsDiv.empty().show();
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
                        resultsDiv.append("No results found");
                    }
                });
            }
        },

        searchByLatLng: function(lat,lng){

            var zoom = App.map.getZoom() || 1;
            var tolerance = 1 / zoom;

            var url = 'http://127.0.0.1:5000/articles';
            url += "?lat=" + lat;
            url += "&lon=" + lng;
            url += "&tolerance=" + tolerance;
            url += "&attrs=id,title,links_count";
            url += "&order_by=links_count";
            url += "&dir=desc";
            url += "&limit=30";
            url = "proxy.php?url="+escape(url);

            $("#map").css("cursor", "wait");

            $.get(url,function(data){

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
            var url = 'http://127.0.0.1:5000/articles/' + id + '.json';
            url = "proxy.php?url="+escape(url);
            $.getJSON(url,function(data){
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
            var url = 'http://127.0.0.1:5000/articles/' + id + '/linked';
            url = "proxy.php?url="+escape(url);
            $.getJSON(url,function(data){
                if (!data || data.length == 0){
                    alert("Sorry, no links for this article");
                    return;
                }

                App.linkedArticles.clearLayers();
                App.linkedArticles.addGeoJSON(data);

                App.linkedLines.clearLayers();

                var bounds = new L.LatLngBounds();

                for (var i = 0; i < data.features.length; i++){
                    var feature = data.features[i];
                    var line = new L.Polyline([ new L.LatLng(App.currentArticle.geometry.coordinates[1],App.currentArticle.geometry.coordinates[0]),
                                            new L.LatLng(feature.geometry.coordinates[1],feature.geometry.coordinates[0])]);
                    App.linkedLines.addLayer(line);

                    // Hack: linkedArticles does not have a getBounds method!
                    bounds.extend(new L.LatLng(feature.geometry.coordinates[1],feature.geometry.coordinates[0]));
                }
                App.linkedLines.setStyle({weight:2, color: "gray",clickable: false});

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
                iconSize: new L.Point(20, 20),
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
                        var popup = new L.Popup();
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
                radius: 4,
                color: "#000",
                weight: 1,
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
                        var color = (properties.links_count != 0) ? "#00FF00" :"#FF0000";
                        e.layer.setStyle({fillColor: color});
                        var popup = new L.Popup();
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


