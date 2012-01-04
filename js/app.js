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
                    var x;
                });
            }
        },

        getArticle: function(id){
            var url = 'http://127.0.0.1:5000/articles/' + id + '.json';
            url = "proxy.php?url="+escape(url);
            $.getJSON(url,function(data){
                if (data){
                    App.addArticle(data);
                    App.getLinkedArticles(id);
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
        },

        getLinkedArticles: function(id){
            var url = 'http://127.0.0.1:5000/articles/' + id + '/linked';
            url = "proxy.php?url="+escape(url);
            $.getJSON(url,function(data){

                App.linkedArticles.clearLayers();
                App.linkedArticles.addGeoJSON(data);

                App.linkedLines.clearLayers();
                for (var i = 0; i < data.features.length; i++){
                    var feature = data.features[i];
                    var line = new L.Polyline([ new L.LatLng(App.currentArticle.geometry.coordinates[1],App.currentArticle.geometry.coordinates[0]),
                                            new L.LatLng(feature.geometry.coordinates[1],feature.geometry.coordinates[0])]);
                    App.linkedLines.addLayer(line);
                }
                App.linkedLines.setStyle({weight:2, color: "gray",clickable: false});
            });

        },

        addArticle: function(feature){
            // Add feature to articles layer
            App.articles.addGeoJSON(feature);


            // Add line
            if (App.currentArticle){
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

            // Set map div size
            $("#map").width($(window).width());
            $("#map").height($(window).height());

            this.map = new L.Map('map');

            // MapQuest OpenStreetMap base map
            var osmUrl = "http://otile{s}.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png";
            var osmAttribution = 'Map data &copy; 2011 OpenStreetMap contributors, Tiles Courtesy of <a href="http://www.mapquest.com/" target="_blank">MapQuest</a> <img src="http://developer.mapquest.com/content/osm/mq_logo.png">';
            var osm = new L.TileLayer(osmUrl, {maxZoom: 18, attribution: osmAttribution ,subdomains: '1234'});
            this.map.addLayer(osm);

            /*
            var bingKey = "AjtIygmd5pYzN3AaY3l_wLlbM2rW5CxbFaLzjxksZptvovvMVAKFwmJ_NDSVcfQu";

            var bing = L.BingLayer(bingKey);

            this.map.addLayer(bing);
            */

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


            this.map.setView(new L.LatLng(0, 0), 1);

            //this.addArticle('125654');
            this.getArticle('31862');
        }
    }
})()

// Add a marker with a custom icon that will show a popup when clicked
/*
var newIcon = L.Icon.extend({
    iconUrl: '../img/marker.png',
    iconSize: new L.Point(14, 25),
    iconAnchor: new L.Point(14, 25),
    popupAnchor: new L.Point(-3, 25)
});
*/
/*
var markerLocation = new L.LatLng(51.5, -0.09);
//var marker = new L.Marker(markerLocation,{icon: new newIcon()});
var marker = new L.Marker(markerLocation);
marker.bindPopup("PROBLEM?")
map.addLayer(marker);

// Set the map view in london, at zoom level 13
var london = new L.LatLng(51.505, -0.09);
map.setView(london, 13);

        }

    }
}


*/
$("document").ready(function(){
        App.setup()
        })


L.BingLayer = L.TileLayer.extend({
    options: {
        subdomains: [0, 1, 2, 3],
        attribution: 'Bing',
    },

    initialize: function(key, options) {
        L.Util.setOptions(this, options);

        this._key = key;
        this._url = null;
        this.meta = {};
        this._update_tile = this._update;
        this._update = function() {
            if (this._url == null) return;
            this._update_attribution();
            this._update_tile();
        };
        this.loadMetadata();
    },

    tile2quad: function(x, y, z) {
        var quad = '';
        for (var i = z; i > 0; i--) {
            var digit = 0;
            var mask = 1 << (i - 1);
            if ((x & mask) != 0) digit += 1;
            if ((y & mask) != 0) digit += 2;
            quad = quad + digit;
        }
        return quad;
    },

    getTileUrl: function(p, z) {
        var subdomains = this.options.subdomains,
            s = this.options.subdomains[(p.x + p.y) % subdomains.length];
        return this._url.replace('{subdomain}', s)
                .replace('{quadkey}', this.tile2quad(p.x, p.y, z))
                .replace('{culture}', '');
    },

    loadMetadata: function() {
        var _this = this;
        var cbid = '_bing_metadata';
        window[cbid] = function (meta) {
            _this.meta = meta;
            window[cbid] = undefined;
            var e = document.getElementById(cbid);
            e.parentNode.removeChild(e);
            if (meta.errorDetails) {
                alert("Got metadata" + meta.errorDetails);
                return;
            }
            _this.initMetadata();
        };
        var url = "http://dev.virtualearth.net/REST/v1/Imagery/Metadata/Aerial?include=ImageryProviders&jsonp=" + cbid + "&key=" + this._key;
        var script = document.createElement("script");
        script.type = "text/javascript";
        script.src = url;
        script.id = cbid;
        document.getElementsByTagName("head")[0].appendChild(script);
    },

    initMetadata: function() {
        var r = this.meta.resourceSets[0].resources[0];
        this.options.subdomains = r.imageUrlSubdomains;
        this._url = r.imageUrl;
        this._providers = [];
        for (var i = 0; i < r.imageryProviders.length; i++) {
            var p = r.imageryProviders[i];
            for (var j = 0; j < p.coverageAreas.length; j++) {
                var c = p.coverageAreas[j];
                var coverage = {zoomMin: c.zoomMin, zoomMax: c.zoomMax, active: false};
                var bounds = new L.LatLngBounds(
                        new L.LatLng(c.bbox[0]+0.01, c.bbox[1]+0.01),
                        new L.LatLng(c.bbox[2]-0.01, c.bbox[3]-0.01)
                );
                coverage.bounds = bounds;
                coverage.attrib = p.attribution;
                this._providers.push(coverage);
            }
        }
        this._update();
    },

    _update_attribution: function() {
        var bounds = this._map.getBounds();
        var zoom = this._map.getZoom();
        for (var i = 0; i < this._providers.length; i++) {
            var p = this._providers[i];
            if ((zoom <= p.zoomMax && zoom >= p.zoomMin) &&
                this._intersects(bounds, p.bounds)) {
                if (!p.active)
                    this._map.attributionControl.addAttribution(p.attrib);
                p.active = true;
            } else {
                if (p.active)
                    this._map.attributionControl.removeAttribution(p.attrib);
                p.active = false;
            }
        }
    },

    _intersects: function(obj1, obj2) /*-> Boolean*/ {
        var sw = obj1.getSouthWest(),
            ne = obj1.getNorthEast(),
            sw2 = obj2.getSouthWest(),
            ne2 = obj2.getNorthEast();

        return (sw2.lat <= ne.lat) && (sw2.lng <= ne.lng) &&
                (sw.lat <= ne2.lat) && (sw.lng <= ne2.lng);
    }
});


