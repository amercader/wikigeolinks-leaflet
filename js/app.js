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
        var latLng = this._map.mouseEventToLatLng(e);

        App.searchByLatLng(latLng);

	}
});



L.Ellipse = L.Circle.extend({
	initialize: function(latlng, radiusX, radiusY, options) {
		L.Path.prototype.initialize.call(this, options);
		
		this._latlng = latlng;
		this._mRadiusX = radiusX;
		this._mRadiusY = radiusY;
	},

    setRadius: function(radiusX,radiusY) {
		this._mRadiusX = radiusX;
		this._mRadiusY = radiusY;

        this._redraw();
		return this;
	},
	
	projectLatlngs: function() {
		var equatorLength = 40075017,
            meridianLength = 40007863,
			scale = this._map.options.scale(this._map._zoom);
		
		this._point = this._map.latLngToLayerPoint(this._latlng);
		this._radiusX = (this._mRadiusX / equatorLength) * scale;
		this._radiusY = (this._mRadiusY / meridianLength) * scale;
	},

    getPathString: function() {
		var p = this._point,
			rx = this._radiusX,
            ry = this._radiusY;	

        if (L.Path.SVG) {
			return "M" + p.x + "," + (p.y - ry) +
					"A" + rx + "," + ry + ",0,1,1," +
					(p.x - 0.1) + "," + (p.y - ry) + " z";
		} else {
			p._round();
			rx = Math.round(rx);
			ry = Math.round(ry);
			return "AL " + p.x + "," + p.y + " " + rx + "," + ry + " 0," + (65535 * 360);
		}
	}

});


var App = (function() {

    // conf options
    var serviceURL = 'http://amercader.net/dev/wikigeolinks-service/articles';

    var bingKey = "AjtIygmd5pYzN3AaY3l_wLlbM2rW5CxbFaLzjxksZptvovvMVAKFwmJ_NDSVcfQu";

    // Can we use CORS on this browser?
    var useCORS = false;
    if (XMLHttpRequest){
        var request = new XMLHttpRequest();
        if (request.withCredentials !== undefined){
            useCORS = true;
        }
    }

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


    var getSearchTolerance = function(latLng){

        // Calculate a tolerance in degrees based on the map scale
        // Formula from http://msdn.microsoft.com/en-us/library/bb259689.aspx
        var zoom = App.map.getZoom()
        var mapScale = (Math.cos(latLng.lat*Math.PI/180)*2*Math.PI*6378137*96)/(256*Math.pow(2,zoom)*0.0254);
        var tolerance = mapScale / 111319 / 200;

        // Adjust with the user setting
        tolerance += tolerance * App.settings.tolerance/100;

        return tolerance;
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
            showLinkedLines: true,
            tolerance: 0
        },

        map: null,

        layers: {
            map: null,
            sat: null,
            currentArticle: null,
            articles: null,
            lines: null,
            linkedArticles: null,
            linkedLines: null,
            searchResults: null
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

            if (!useCORS){
                // We need to use JSONP
                url += (url.indexOf("?") === -1) ? "?" : "&";
                url += "callback=?"
            }

            return url;
        },

        searchByLatLng: function(latLng){

            $("#map").css("cursor", "wait");

            var tolerance = getSearchTolerance(latLng);

            var centerPoint = L.Projection.Mercator.project(latLng);
            var pointX = L.Projection.Mercator.project(new L.LatLng(latLng.lat ,latLng.lng + tolerance));
            var pointY = L.Projection.Mercator.project(new L.LatLng(latLng.lat + tolerance,latLng.lng));

            var radiusX = Math.abs(centerPoint.x - pointX.x);
            var radiusY = Math.abs(centerPoint.y - pointY.y);


            var offset = "";
            var params = {
                lat: latLng.lat,
                lon: latLng.lng,
                tolerance: tolerance,
                attrs:"id,title,links_count",
                order_by:"links_count",
                dir:"desc",
                limit:"30"
            };

            $.getJSON(this.getURL(offset,params),function(data){

                App.layers.searchResults.clearLayers();
                var circle = new L.Ellipse(
                        latLng,
                        radiusX,
                        radiusY,
                        {color:"red"}
                    ).on("click",function(){
                        App.map.openPopup(popup);
                    });

                App.layers.searchResults.addLayer(circle);

                var container = $("<div></div>").addClass("results");
                var resultsUl = $("<ul></ul>");

                if (data && data.features && data.features.length){
                    var li, title, results, leafletLayer;
                    for (var i = 0; i < data.features.length; i++){

                        leafletLayer = L.GeoJSON.geometryToLayer(data.features[i].geometry,function (latlng){
                                    return new L.CircleMarker(latlng, {
                                        radius: 3,
                                        fillColor: "gray",
                                        color: "#000",
                                        weight: 1,
                                        opacity: 1,
                                        fillOpacity: 0.8
                                        })
                                    }
                                 );

                        title = data.features[i].properties.title;

                        result = title + " (" + data.features[i].properties.links_count + ")";

                        li = $("<li></li>")
                            .append(result)
                            .attr("data-value",result)
                            .click({"feature": data.features[i]},function(e){
                                App.map.closePopup();
                                App.clear();
                                App.addArticle(e.data.feature);
                                App.getLinkedArticles(e.data.feature.id);
                                })
                            .mouseover({"layer": leafletLayer},function(e){
                                e.data.layer.setStyle({fillColor: "yellow"});
                                })
                            .mouseout({"layer": leafletLayer},function(e){
                                e.data.layer.setStyle({fillColor: "gray"});
                                });

                        resultsUl.append(li);

                        App.layers.searchResults.addLayer(leafletLayer);

                    }

                    container.append(resultsUl);
                } else {
                    container.append("No articles found near this point");
                }

                var popup = new L.Popup();
                popup.setLatLng(new L.LatLng(latLng.lat+tolerance,latLng.lng));
                // We need the actual DOM object
                popup.setContent(container.get(0));

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

            App.layers.searchResults.clearLayers();

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

            // UI widgets
            $("#tolerance").slider({
                min: -50,
                max: 50,
                value: 0,
                slide: function(e,ui){
                    App.settings.tolerance = ui.value;
                }
            });


            var onResize = function(){
                // Set map div height
                var correction =  ($(window).width() >= 980) ? 40 : 50;
                $("#map").height($(window).height() - correction); // minus the nav bar
            };

            onResize();
            $(window).resize(onResize);

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

            this.layers.searchResults = new L.LayerGroup([]);
            this.map.addLayer(this.layers.searchResults);

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

            this.map.setView(new L.LatLng(0, 0), 2);

        }
    }
})()


$("document").ready(function(){
        App.setup()
});


