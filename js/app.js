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

    var bingKEY = "AjtIygmd5pYzN3AaY3l_wLlbM2rW5CxbFaLzjxksZptvovvMVAKFwmJ_NDSVcfQu";


    var formatLink = function(string){
        return encodeURIComponent(string.replace(" ","_","g"));
    }

    var getPopupContent = function(properties){
        return '<div class="popup-article-content">' +
                   '<a href="http://en.wikipedia.org/wiki/' + formatLink(properties.title) +
                   '" target="_blank" title="Wikipedia article for ' + properties.title + '">' +
                   properties.title + '</a>' +
                   '<div class="links-count">' + properties.links_count + ' linked articles</div>' +
               '</div>';


    }

    // Custom lookup function for Bootstrap typeahead
    var ajaxLookup = function (event) {

        var that = this;

        this.query = this.$element.val()

        if (!this.query || this.query.length < 3) {
            return this.shown ? this.hide() : this
        }

        var offset = "";
        var params = {
            title__ilike: "%" + this.query + "%",
            attrs:"id,title,links_count",
            queryable:"title",
            order_by:"links_count",
            dir:"desc",
            limit:"12"
        };

        $.get(App.getURL(offset,params),function(data){
            var items = [];
            for (var i = 0; i < data.features.length; i++){
                title = data.features[i].properties.title;
                result = title + " (" + data.features[i].properties.links_count + ")";
                items.push(result);
            }
            if (!items.length) {
                return that.shown ? that.hide() : that
            }
            that.render(items.slice(0, that.options.items))

            that.$menu.find("li").map(function(i,element){
                $(element).click({"feature": data.features[i]},function(e){
                            App.clear();
                            App.addArticle(e.data.feature);
                            App.getLinkedArticles(e.data.feature.id);

                });
            })
            that.show()
        });
    }

    return {

        settings: {
            showPreviousArticles: true,
            showLinkedLines: true
        },

        map: null,

        layers: {
            map: null,
            sat: null,
            currentArticle: null,
            articles: null,
            lines: null,
            linkedArticles: null,
            linkedLines: null
        },

        currentFeature: null,

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
            App.layers.currentArticle.clearLayers();
            App.layers.articles.clearLayers();
            App.layers.lines.clearLayers();
            App.layers.linkedArticles.clearLayers();
            App.layers.linkedLines.clearLayers();

            App.map.closePopup();

            App.currentFeature = null;

            $("#search").val("");
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
                App.layers.linkedLines.clearLayers();

                for (var i = 0; i < data.features.length; i++){
                    var feature = data.features[i];

                    var line = new L.Polyline([
                                    new L.LatLng(App.currentFeature.geometry.coordinates[1],App.currentFeature.geometry.coordinates[0]),
                                    new L.LatLng(feature.geometry.coordinates[1],feature.geometry.coordinates[0])]);
                    App.layers.linkedLines.addLayer(line);

                    // Hack: linkedArticles does not have a getBounds method!
                    bounds.extend(new L.LatLng(feature.geometry.coordinates[1],feature.geometry.coordinates[0]));
                }

                App.layers.linkedLines.setStyle({weight:2, color: "gray",clickable: false});

                App.layers.linkedArticles.clearLayers();
                App.layers.linkedArticles.addGeoJSON(data);

                // Make sure current article is shown in the bounds
                bounds.extend(new L.LatLng(App.currentFeature.geometry.coordinates[1],App.currentFeature.geometry.coordinates[0]));

                App.map.fitBounds(bounds);
            });

        },

        addArticle: function(feature){

            if (App.currentFeature){

                // Add previous feature to articles layer
                App.layers.articles.addGeoJSON(App.currentFeature);

                // Add line
                var line = new L.Polyline([ new L.LatLng(App.currentFeature.geometry.coordinates[1],App.currentFeature.geometry.coordinates[0]),
                                        new L.LatLng(feature.geometry.coordinates[1],feature.geometry.coordinates[0])]);
                App.layers.lines.addLayer(line);
                App.layers.lines.setStyle({weight:4, color: "red",clickable: false});
            }
            // Add new feature to the current article layer
            App.layers.currentArticle.clearLayers();
            App.layers.currentArticle.addGeoJSON(feature);

            App.currentFeature = feature;
        },

        setMapBackground: function(mode){
            mode = mode || "map";
            if (mode == "map"){
                App.map.removeLayer(App.layers.sat).addLayer(App.layers.map);
            } else if (mode == "sat"){
                App.map.removeLayer(App.layers.map).addLayer(App.layers.sat);
            }
            $("#bing-attribution").toggle();
        },

        setup: function(){

            // Use our custom lookup function for the search field typeahead
            $.extend(
                    $('#search').typeahead({items:12}).data('typeahead'),
                    {lookup:ajaxLookup}
                    );

            $("#bg-map").click(function(){ App.setMapBackground("map"); });
            $("#bg-sat").click(function(){ App.setMapBackground("sat"); });


            $("#clear").click(App.clear);
            $("#random").click(App.randomArticle);


            $("#show-previous-articles").click(function(){
                App.settings.showPreviousArticles = !App.settings.showPreviousArticles;
                if (App.settings.showPreviousArticles){
                    App.map.addLayer(App.layers.articles);
                    App.map.addLayer(App.layers.lines);
                } else {
                    App.map.removeLayer(App.layers.articles);
                    App.map.removeLayer(App.layers.lines);
                }

            });
            $("#show-linked-lines").click(function(){
                App.settings.showLinkedLines = !App.settings.showLinkedLines;
                if (App.settings.showLinkedLines){
                    App.map.addLayer(App.layers.linkedLines);
                } else {
                    App.map.removeLayer(App.layers.linkedLines);
                }

            });


            // Set map div size
            $("#map").width($(window).width());
            $("#map").height($(window).height() - 40); // minus the nav bar 40px

            // Leaflet setup
            this.setupMap();


            this.getArticle('31862');

       },

        setupMap: function(){

            this.map = new L.Map('map');

            // MapQuest OpenStreetMap base map
            var mapUrl = "http://otile{s}.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png";
            var osmAttribution = 'Map data &copy; 2011 OpenStreetMap contributors, Tiles Courtesy of <a href="http://www.mapquest.com/" target="_blank">MapQuest</a> <img src="http://developer.mapquest.com/content/osm/mq_logo.png">';
            this.layers.map = new L.TileLayer(mapUrl, {maxZoom: 18, attribution: osmAttribution ,subdomains: '1234'});

            // Bing Aerial base layer
            this.layers.sat = new L.TileLayer.Bing(bingKey,"Aerial");

            this.map.addLayer(this.layers.map);

            this.layers.lines = new L.MultiPolyline([]);
            this.map.addLayer(this.layers.lines);

            this.layers.linkedLines = new L.MultiPolyline([]);
            this.map.addLayer(this.layers.linkedLines);


            var articlesIcon = L.Icon.extend({
                iconUrl: 'img/icon_wiki.png',
                shadowUrl: 'img/icon_wiki_shadow.png',
                iconSize: new L.Point(20, 20),
                shadowSize: new L.Point(27, 27),
                iconAnchor: new L.Point(10, 10),
                popupAnchor: new L.Point(0, 0)
            });

            var articlesPointToLayer = function (latlng) {
                    return new L.Marker(latlng, {
                        icon: new articlesIcon()
                    });
            };

            var articlesFeatureParse = function(e) {
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
            };

            this.layers.articles = new L.GeoJSON(null,{ pointToLayer: articlesPointToLayer});
            this.layers.articles.on("featureparse", articlesFeatureParse);

            this.map.addLayer(this.layers.articles);

            this.layers.currentArticle = new L.GeoJSON(null,{ pointToLayer: articlesPointToLayer});
            this.layers.currentArticle.on("featureparse", articlesFeatureParse);

            this.map.addLayer(this.layers.currentArticle);

            var linkedArticlesMarkerOptions = {
                radius: 5,
                color: "gray",
                weight: 2,
                opacity: 1,
                fillOpacity: 1
            };

            this.layers.linkedArticles = new L.GeoJSON(null,{
                pointToLayer: function (latlng) {
                    return new L.CircleMarker(latlng, linkedArticlesMarkerOptions);
                }
            });
            this.layers.linkedArticles.on("featureparse", function(e) {
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


            this.map.addLayer(this.layers.linkedArticles);

            var pointQuery = new L.Handler.CtrlClickQuery(this.map);
            pointQuery.enable()

            this.map.setView(new L.LatLng(0, 0), 1);

        }
    }
})()


$("document").ready(function(){
        App.setup()
});


