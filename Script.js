/* City sensor list is loaded from external JSON, sensors.js * /*/
$( document ).ready(function() {

    /* Create some basic UI for the visualization*/
    makeUI();

    /* Initial Fetch of Sensor info and daily averages */
    fetchSummary();
});

/* Data Canvas API*/
var url = "http://sensor-api.localdata.com/api/v1/";

/* TODO: Create separate arrays for multiple lines*/
var markers = [];
var current_field = "dust";
var series = {};
var graphs = {};
var summary = {};
var sensors = {};

/* TODO: make the min the mean value of the category*/
var seriesData = [];
var graph, graph_options =  {
    element: document.querySelector("#chart"),
    width: 580, height: 100, stroke: true, strokeWidth: 1.0, renderer: 'area', min: "auto",
    series: [ {
        // color and data get update for each variable type
        color: 'lightblue', data: seriesData, name: current_field
    }]
};

/* Lookup table for the different enviornment variables.*/
var fields = {
    "temperature" : { name : "temperature", label : "Temperature", unit : "C", color : "#CC714D"},
    "light" : { name : "light_summary", label : "Light", unit : "Lux", color : "#CEB449"},
    "humidity" : { name : "humidity", label : "Humidity", unit : "%", color : "#567A86"},
    "airquality" : { name : "pollution_summary", label : "Air Quality", unit : "?", color : "#FBAF3F"},
    "airquality_raw" : { name : "pollution", label : "Pollution", unit : "mV", color : "#8F8D41"},
    "dust" : { name : "dust", label : "Dust", unit : "pcs/238ml", color : "#94753D"},
    "sound" : { name : "noise", label : "Noise", unit : "mV", color : "#827579"},
    "uv" : { name : "light", label : "Light", unit : "Lux", color : "#CEB449"}
};

function makeUI() {

    _.each(cities, function(city){
        $("#cities").append("<option value='" + city.name + "'>" + city.name + "</option>");
    });

    setCity();

    $("#select_sensor").bind("change", function(){
        $("#charts").html("");
        $("#x_axis").html("");
        fetchSummary();
    });

    $("#cities").bind("change", function(){ setCity() });

    /* Get the sensors for the current city*/
    function setCity() {
        var city = $("#cities").val();
        city_sensors = 	_.findWhere(cities, { name : city });
        sensors = city_sensors.sensors;

        setSensors();
    }

    /* Update sensors for current city*/
    function setSensors() {
        $("#select_sensor").html("");
        _.each(sensors, function(sensor){
            $("#select_sensor").append("<option value='" + sensor.id + "'>" + sensor.hood + " - " + sensor.name + "</option>");
        });
    }
}


/* Fetch Summary Stats */
function fetchSummary() {
    var today = new Date();
    fetchData(url + "aggregations?each.sources=" + $("#select_sensor").val() + "&fields=temperature,airquality_raw,humidity,light,dust,sound,uv&op=mean&from=2015-01-01T00:00:00Z&before=" + today.toISOString() + "&resolution=24h", showSummary);
}

function fetchAllData() {
    fetchData(url + "sources/" + $("#select_sensor").val() + "/entries?&sort=desc", function(data){
        var series = sortData(data.data);
        console.log("series results: ", series)
        showGraph(series)
    });

    /* Update at a regular interval */
    var iv = setInterval( function() {
        _.each(fields, function(field) {
            series[field] = [];
        });

        fetchData(url + "sources/" + $("#select_sensor").val() + "/entries?&sort=desc", function(data){
            var series = sortData(data.data);
            updateGraph(series)
        });
    }, 1000 * 10);
}

function showSummary(data) {

    /* TODO: Maker clearer chaining of functions*/
    fetchAllData();

    console.log("summary data: ", data);
    /* TODO: Support multiple cities*/
    var sensor = _.findWhere(sensors, { id : $("#select_sensor").val() });
    var lat = sensor.location[1];
    var lng = sensor.location[0];
    var coord = L.latLng(lat, lng);
    map.setView(coord);
    var marker = L.marker(coord).addTo(map);
    markers.push(marker);

    /* TODO: Properly clear the summary stats object*/
    summary = {};
    _.each(fields, function(field) {
        summary[field.name] = [];
    });

    _.each(data.data, function(item){
        _.each(fields, function(field, j) {
            summary[field.name].push(item[j])
        });
    });

    /* Reverse geocode the place using Open Street Maps*/
    fetchData("http://nominatim.openstreetmap.org/reverse?format=json&lat=" + lat + "&lon=" + lng + "&zoom=18&addressdetails=1", function(place){
        console.log("place data: ", place);

        $("#neighborhood .summary").html("");
        $("#neighborhood .summary").append("<h2>" + place.address.neighbourhood + "</h2>");
        $("#neighborhood .summary").append("<span>" + place.display_name + "</span><br/>");
        $("#neighborhood .summary").append("<span>" + place.address.city + "</span><br/>");
        $("#neighborhood .summary").append("<span>" + place.address.postcode + "</span><br/>");
    })
}

function showGraph(data, field) {

    _.each(fields, function(field) {

        var details = field;
        field = field.name;

        /* Calculate the Stats by Day for all time */
        var mean = ss.mean(summary[field]);
        mean = Math.round(mean * 10) / 10;

        var standard_deviation = ss.standard_deviation(summary[field]);

        var min = ss.min(summary[field]);
        var max = ss.max(summary[field]);

        if(field == "pollution_summary" || field == "light") {
            return false;
        }

        $("#charts").append("<div class='sensor " + field + "'>" +
            "<div class='category'>" +
            "<div class='label'>" + details.label + "</div>" +
            "<img class='icon " + field + "' src='https://s3-us-west-2.amazonaws.com/s.cdpn.io/230399/" + field  + ".svg'/>" +
            "<div class='average'>" + mean + "<div class='inline'>Daily average in " + details.unit + "</div></div>" +
            "</div>" +
            "<div id='" + field + "'></div>" +
            "<div class='y_axis'></div>" +
            "</div>");

        // TODO: Move to separate func.
        var width = $(".sensor").width() - $(".category").width() - 40;
        graph_options.width = width;
        graph_options.element = document.querySelector("#" + field);
        graph_options.series = [{
            color: details.color,
            data: series[field],
            name: field
        }]

        /* Create the new graph*/
        graphs[field] = new Rickshaw.Graph(graph_options);

        /*
         var y_axis = new Rickshaw.Graph.Axis.Y( {
         graph: graphs[field],
         orientation: 'left',
         element: document.getElementById('y_axis'),
         });
         */

        var hoverDetail = new Rickshaw.Graph.HoverDetail( {
            graph: graphs[field],
            xFormatter: function(x) {
                var format = d3.time.format("%H:%M:%S");
                var time = new Date(series[field][x].time);
                return format(time)
            },
            yFormatter: function(y) { return y; }
        });

        /*
         var axes = new Rickshaw.Graph.Axis.Time( {
         graph: graphs[field],
         tickFormat: graphs[field].x.tickFormat()
         });

         axes.render();
         */
        graphs[field].render();

    });

    /* Just show a global x axis */

    var x_ticks = new Rickshaw.Graph.Axis.X( {
        graph: graphs.dust,
        element: document.getElementById('x_axis'),
        pixelsPerTick: 100,
        tickFormat: function(x) {
            var format = d3.time.format("%H:%M");
            var time = new Date(series.dust[x].time);
            return format(time)
        }
    });

    x_ticks.render()

}

function updateGraph(data, field) {

    _.each(fields, function(field) {

        var details = field;
        field = field.name;

        if (field == "pollution_summary" || field == "light") {
            return false;
        }

        graphs[field].series[0].data = series[field];
        graphs[field].update();

    });
}

/* Generic JSONP Request*/
function fetchData(url, callback) {
    $.ajax({
        type: "GET",
        dataType: "JSON",
        jsonpCallback: 'jsonCallback',
        url: url,
        success: function(result) {
            var result = JSON.parse(result);
            callback(result)
        },
        error: function(result) {
            console.log(result);
        }
    });
}

/* Sort the object and prepare it for Rickshaw chart*/
function sortData(data) {
    /* For precaution, sort the object by date*/
    data.sort(function(a, b){
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    });

    initFields();
    /* Create X and Y fields, which Rickshaw expects*/
    _.each(data, function(x, i) {

        /*initFields();*/
        _.each(x.data, function(y, j){
            if (j !== "location" && j !== "airquality") {
                var key = fields[j].name;
                series[key].push({ x : i, y : y, time: x.timestamp })
            }
        });
    });

    return data;
}

/* Mapbox initialiation */
var mapMain = 'mapbox.wheatpaste';
L.mapbox.accessToken = 'pk.eyJ1IjoiYmVlcHRjIiwiYSI6ImNpaDZzeTl6czA3cm11MWtpcmZjODhsMHAifQ.oZ9PBLwvwcMX7fBaHGDnAg';
map = L.mapbox.map('map', mapMain, {
    attributionControl: false,
    maxZoom: 18,
    minZoom: 5
}).setView([34.0261899,-118.2455643], 17);

initFields();
function initFields() {
    _.each(fields, function(field) {
        series[field.name] = [];
    });
}
