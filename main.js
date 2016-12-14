/* 
 *
 */

var DukeOfHazardLAF = "<head><style>table {    font-family: arial, sans-serif;    border-collapse: collapse;    ;}" +
"td, th {    border: 1px solid #dddddd;    text-align: left;    padding: 8px;}tr:nth-child(even) {    background-color: #dddddd;}" +
"title {font-family: arial, sans-serif;} " +
"h1 {font-family: arial, sans-serif;}" +
"h2 {font-family: arial, sans-serif;}" +
"p {font-family: arial, sans-serif;}" +
"</style><title>Duke of Hazard</title></head>";

// For ease of testing from inside the firewall
var useProxy = false;

var weatherHost = 'graphical.weather.gov';
var weatherPort = 80;
var proxyHost = 'www-proxy.us.oracle.com';
var proxyPort = 80;

/**
 * Composes a response using the provided zip code.
 * @param {type} request
 * @param {type} response
 * @param {type} zipcode
 * @return {undefined}
 */
function respondUsingZip(request, response, zipcode) {
//    console.log('In respondUsingZip with zipcode = ' + zipcode);
    processWeather(weatherPathForZip(zipcode), response, respond, zipcode);
}

/**
 * Callback which converts weather info retrieved from the NWS site into
 * HTML output and writes it to the HTTP response.
 * @param {type} response
 * @param {type} location
 * @param {type} weatherInfo
 * @return {undefined}
 */
function respond(response, location, weatherInfo) {
    //console.log('In respond with weatherInfo ========\n' + weatherInfo + '\n========\n');
    response.writeHead(200, {'Content-Type': 'text/html'});
    var alerts = extractAlerts(weatherInfo);
    response.write(formatAlerts(alerts, location));
    //console.log('About to end response');
    response.end();
}

/**
 * Extracts alert times and alerts from all the weather info returned by the query to the NWS site
 * and retains only the earliest entry that refer to the same alert.
 * @param {type} weatherInfo
 * @return {Array|trimHazards.trimmedHazards}
 */
function extractAlerts(weatherInfo) {
    var startValidTimes = extractStartValidTimes(weatherInfo);
    var hazards = extractHazards(weatherInfo);
    return trimHazards(startValidTimes, hazards);
}

/**
 * Formats the provided alert objects as HTML for display to the client.
 * @param {type} alerts
 * @param {type} location
 * @return {DukeOfHazardLAF|String}
 */
function formatAlerts(alerts, location) {
    var result = DukeOfHazardLAF;

    result += "<body><h1>Duke of Hazard</h1><h2>Alerts for " + location + "</h2><table><tr><th>Time</th><th>Alert</th></tr>\n";
    
    for (var i = 0; i < alerts.length; i++) {
        result += "<tr><td>" + makeLink(alerts[i].time.toUTCString(),alerts[i].hazard.url) + "</td>";
        result += "<td>" + makeLink(alerts[i].hazard.phen + " " + alerts[i].hazard.sign, alerts[i].hazard.url) + "</td></tr>";
    }
    
    result += "</table>";
    
    if (alerts.length > 0) {
        result += "<iframe src='" + alerts[0].hazard.url + "' width='100%' height='500' frameborder='1' allowfullscreen sandbox>" +
                "</iframe>";
    }
    
    result += "</body>";
    //console.log("formatAlerts result is \n-----" + result + "\n-----");
    return result;
}

function makeLink(text, url) {
    return "<a href='" + url + "'>" + text + "</a>";
}

/**
 * Extracts the start times for the alert entries into an array of Date objects.
 * @param {type} weatherInfo
 * @return {Array|extractStartValidTimes.times}
 */
function extractStartValidTimes(weatherInfo) {
    var re = new RegExp("<start-valid-time>(.*?)</start-valid-time>","g");
    var matcher;
    var times = [];
    while (matcher = re.exec(weatherInfo)) {
        var timeString = matcher[1];
        var time = new Date(timeString);
        times.push(time);
    }
    return times;
}

/**
 * Extracts hazard entries from the returned weather info.
 * 
 * The returned array has to be paralle with the array of timestamps (the returned
 * data expresses them separately in the XML) so empty hazard entries still need
 * to be represented in the result. The returned array contains nulls in those slots.
 * 
 * @param {type} weatherInfo
 * @return {Array|extractHazards.hazards}
 */
function extractHazards(weatherInfo) {
    var re = new RegExp("<hazard-conditions>([\\s\\S]*?)</hazard-conditions>|<hazard-conditions/>","g");
    var innerRE = new RegExp('<hazard.*?phenomena="(.*?)".*?significance="(.*?)"[\\s\\S]*?<hazardTextURL>(.*?)</hazardTextURL>','g');
    
    var outerMatcher;
    var hazards = [];
    while (outerMatcher = re.exec(weatherInfo)) {
        var innerMatcher;
        var hazardInfo = {
            phen: null,
            sign: null,
            url: null
        };
        while (innerMatcher = innerRE.exec(outerMatcher[1])) {
//            console.log("  phen is " + innerMatcher[1] + ", signif is " + innerMatcher[2] +
//                    ", url is " + innerMatcher[3]);
            hazardInfo.phen = innerMatcher[1];
            hazardInfo.sign = innerMatcher[2];
            hazardInfo.url = innerMatcher[3];
        }
        if (hazardInfo.phen === null) {
            hazardInfo = null;
        }
        hazards.push(hazardInfo);
//        if (hazardInfo == null) {
//            console.log("Pushed null hazard");
//        } else {
//            console.log("Pushed hazard " + hazardInfo.phen + " " + hazardInfo.sign + " " + hazardInfo.url);
//        }
    }
    return hazards;
}

/**
 * Converts parallel arrays of times and hazards into a single result
 * array that is pruned so any given hazard appears only once. (The input
 * arrays might refer to the same hazard multiple times.)
 * @param {type} times
 * @param {type} hazards
 * @return {Array|trimHazards.trimmedHazards}
 */
function trimHazards(times, hazards) {
    var trimmedHazards = [];
    var previousHazard = null;
    for (var i = 0; i < hazards.length; i++) {
        if (hazards[i] != null) {
            var trimmedHazard = {
                time: times[i],
                hazard: hazards[i]
            };
            if (previousHazard == null || previousHazard.hazard.url !== trimmedHazard.hazard.url) {
                trimmedHazards.push(trimmedHazard);
            }
            previousHazard = trimmedHazard;
        }
    }
    return trimmedHazards;
}
function weatherPathForZip(zipcode) {
    var path = weatherPathPrefix() + 'zipCodeList=' + zipcode + weatherPathSuffix();
    console.log('Computed path for zip is ' + path);
    return path;
}

function weatherPathForLatLong(latitude, longitude) {
    var path = weatherPathPrefix() + 'lat=' + latitude + '&lon=' + longitude + weatherPathSuffix();
    console.log('Computed path for lat/long is ' + path);
    return path;
}

function weatherPathSuffix() {
    var now = new Date();
    var oneHourAgo = new Date();
    oneHourAgo.setTime(oneHourAgo.getTime() - 60 * 60 * 1000);
    var oneHourAgoString = oneHourAgo.toISOString();
    var nowString = now.toISOString();
    
    return "&product=time-series&begin=" + oneHourAgoString.substr(0,oneHourAgoString.length-1) + 
            // "&end=" + nowString.substr(0,nowString.length-1) + 
            "&wwa=wwa";  
}

function weatherPathPrefix() {
    return '/xml/sample_products/browser_interface/ndfdXMLclient.php?';
}

/**
 * Sends a ReST request to the NWS site using the path specified (it varies 
 * based on how the user is requesting the data -- zip code vs. lat/long) and
 * passes the returned response to the callback for processing once the full
 * response has arrived.
 * @param {type} path
 * @param {type} response
 * @param {type} callback
 * @param {type} location
 * @return {undefined}
 */
function processWeather(path, response, callback, location) {
         
    var options = {
        host: weatherHost,
        port: weatherPort,
        path: path,
        method: 'GET'
    };

    var weatherURL = 'http://' + weatherHost + ":" + weatherPort + path;
    
    if (useProxy) {
        options.host = proxyHost;
        options.port = proxyPort;
        options.path = weatherURL;
    }
    
//    console.log('About to send request to get weather: ' + weatherURL);
    var req = http.request(options, function (res) {
//        console.log('Just inside the callback for response event');
        res.setEncoding('utf8');
        var result = '';
        res.on('data', (chunk) => {
            result += chunk;
            //console.log('Received weather info \n--------\n' + chunk + '\n--------\n');
        });
        res.on('end', () => {
                //console.log('Found end of weather response; about to invoke callback');
                callback(response, location, result);
            });
    });
    req.end();
    req.on('error', (e) => {
        console.log('Error during request: ' + e.message);
    });
    
}

function respondUsingLatLong(request, response, latitude, longitude) {
        processWeather(weatherPathForLatLong(latitude, longitude), response, respond, latitude + ',' + longitude);

}

function handleRequest(request, response) {
    var parsedURL = url.parse(request.url, true /* parseQueryString */);
    var path = parsedURL.path;
    console.log('In handleRequest with path ' + path );
    
    var query = parsedURL.query;
    var zipcode = query.zip;
    if (typeof query.zipcode !== "undefined" && query.zipcode !== "") {
        zipcode = query.zipcode;
    }
    var latitude = query.lat;
    var longitude = query.lon;
    if (typeof query.long !== "undefined") {
        longitude = query.long;
    }
    if (typeof zipcode !== "undefined" && zipcode !== "") {
        respondUsingZip(request, response, zipcode);
    } else if (typeof latitude !== "undefined" && typeof longitude !== "undefined") {
        respondUsingLatLong(request, response, latitude, longitude);
    } else if (parsedURL.path === "/") {
        respondWithPrompt(request, response);
    } else if (parsedURL.path.substr(1,1) !== '?') {
        respondWithPathContent(request, path, response);
    } else {
        respondWithPrompt(request, response);
    }
    
    //console.log('Zip is ' + zipcode + ', lat/long are ' + latitude + "/" + longitude);
//    response.writeHead(200, {'Content-Type': 'text/plain'});
//    response.end('Hello World\n');
}

function respondWithPrompt(request, response) {
    respondWithPathContent(request, "/public/index.html", response);
}

function respondWithPathContent(request, path, response) {
    console.log('Responding with content for path ' + path);
    fs.readFile(path.substr(1,path.length - 1), function (error, pgResp) {
        if (error) {
            response.writeHead(404);
            response.write('Sorry, I could not find the content ' + path);
        } else {
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.write(pgResp);
        }
        response.end();
    });
//    response.writeHead(200, {'Content-Type': 'text/plain'});
//    response.write('Please specify either a zip code or a latitude/longitude pair');
//    response.end();
}

var http = require('http');
var url = require('url');
var os = require('os');
var fs = require('fs');

var port=8080;
http.createServer(function (request, response) {
    handleRequest(request, response);
}).listen(port);

console.log('Server running at http://127.0.0.1:'+port);

