# Redis Stack Polygon Search Trains Demo

![Polygon search example in action](screenshots/polysearching.gif)

## Introduction

This repository is a small self-contained demonstration of the Polygon Search functionality that was added in the 7.2 release of Redis Stack.

For information about this release and the other new features in it, check out the [blog post](https://redis.com/blog/introducing-redis-7-2/).

Using data from the Bay Area Rapid Transit ([BART](https://www.bart.gov/system-map)) system, we'll look at how to use the Search capability of Redis Stack to find stations that fall within an area described by a polygon, and which optionally have certain attributes.

## Prerequisites

You'll need to have the following installed:

* [Node.js](https://nodejs.org/) - version 18 or higher.  We've tested this with Node.js v18.14.2.
* [Docker Desktop](https://www.docker.com/products/docker-desktop/).
* [Git command line tools](https://git-scm.com/downloads) to clone the repository (or if you don't have these, you can get a .zip file from GitHub instead).
* A browser (we've tested this with [Google Chrome](https://www.google.com/chrome/)).
* Optional but recommended: [RedisInsight](https://redis.io/docs/ui/insight/) - a graphical tool for viewing and managing data in Redis.

## Running the Demo

To run the demo, you'll need to clone the repository from GitHub, install the dependencies and start a Redis Stack instance.  We've provided a Docker Compose file for Redis Stack.  Enter the following commands:

```
git clone https://github.com/redis-developer/redis-polygon-search-trains-demo.git
cd redis-polygon-search-trains-demo
npm install
docker-compose up -d
```

We're using a `.env` file to store secrets such as the host and port that Redis runs on.  An example environment file `example.env` is included in this repository.

If you're using Redis Stack with the Docker Compose provided, you won't need to change any values, and can just copy `env.example` to `.env`:

```
cp env.example .env
```

If you need to change the Redis connection details (for example because your Redis Stack instance runs remotely or uses a password, or you want to change the port that the backend server runs on), edit `.env` accordingly before proceeding further.

Now load the data into Redis Stack:

```
npm run load data/stations.json
```

You should see output similar to this:

```
Stored 12th St. Oakland City Center as station:12th
Stored 16th St. Mission as station:16th
...
Stored West Oakland as station:woak
Checking for previous index and dropping if found.
Dropped old search index.
Creating index.
Done!
```

Finally, start the [Express](https://expressjs.com/) server.  This uses [nodemon](https://www.npmjs.com/package/nodemon), so any changes you make to the source code will cause the server to automatically restart for you.

```
npm run dev 
```

Point your browser at `http://localhost:5000` and start clicking and dragging markers to create a polygon.  

Hit the "Search" button to search for matching stations, use the toggle buttons to specify whether your results must have, for example, parking.

Use the "Reset" button to clear your polygon and any matching search results.

Click on a blue search result marker to see more information about that station in a pop up dialog.

When you're finished using the demo, stop the Express server using `Ctrl-C`, then turn off the Docker container like so:

```
docker-compose down
```

## Redis Data Model

Each station's data is stored as a JSON document using Redis Stack's JSON data type.

Each station has a unique four character ID that BART uses.  We use these as part of the Redis keys, so the JSON document for "Colma" (ID `COLM`) is:

```
station:colm
```

Using a common prefix `station:` allows us to identify what sort of data might be stored at the key more easily, and also allows us to configure the search capability of Redis Stack to only index that part of the keyspace.

Take a look at one of the keys using either RedisInsight or the Redis CLI.

Start the Redis CLI which will automatically connect to Redis at `localhost:6379` (our Docker container):

```
docker exec -it redis-polygon-search-trains-demo redis-cli
```

Now use the [`JSON.GET`](https://redis.io/commands/json.get/) command to retrieve a station's document:

```
127.0.0.1:6379> json.get station:colm
"{\"abbr\":\"COLM\",\"name\":\"Colma\",\"description\":\"The Town of Colma is a diverse community on the San Francisco peninsula that maintains that \\\"small town\\\" feel despite being so close to major cities. The Colma BART Station is close to residential neighborhoods and shopping areas. Colma is perhaps best known for its 17 cemeteries, which comprise approximately 73% of the town's land area. The town incorporated in 1924 primarily to protect this land use. Colma's cemeteries represent numerous religious beliefs and nationalities, and include structures and districts which are historically significant on local, state and national levels.\",\"position\":\"POINT(-122.466233 37.684638)\",\"latitude\":37.684638,\"longitude\":-122.466233,\"lockers\":\"true\",\"parking\":\"true\",\"bikeRacks\":\"true\",\"city\":\"Colma\",\"county\":\"sanmateo\"}"
```

If you're using RedisInsight, start it up and add a new connection to Redis at `localhost` port `6379` with no user or password specified.  You can then browse the key space and see the data contained in each key.

You'll see that each station contains a JSON document with the following data items in it:

* `abbr`: The four character unique ID for this station.
* `name`: The name of the station.
* `description`: Text describing the station and local area.
* `position`: A [Well-known Text](https://en.wikipedia.org/wiki/Well-known_text_representation_of_geometry) Point representation of the station's longitude/latitude location.  Example: `POINT(-122.414123 37.779732)` where `37.779732` is the latitude and `-122.414123` is the longitude.  This is required as searching by polygons uses the Well-known Text geometry format.
* `longitude`: The longitude of the station.
* `latitude`: The latitude of the station.
* `lockers`: A true/false text flag indicating whether the station has bike lockers.
* `parking`: A true/false text flag indicating whether the station has a parking lot.
* `bikeRacks`: A true/false text flag indicating whether the station has bike racks.
* `city`: The name of the city that the station is located in.
* `county`: The name of the county that the station is located in.

If you'd like to see the raw data for all 50 stations, take a look in the [`data/stations.json`](data/stations.json) file.

## How does the Demo Work?

### Loading the Data and Creating an Index

Data loading is handled by the `dataloader.js` script.  This connects to Redis Stack, and reads the data from the `data/stations.json` file.

Each station's object gets written to Redis Stack as its own JSON document with its own Redis key (which begins with the `station:` prefix).  

When adding the documents to Redis Stack, the data loader adds one extra field: `position`.  This is in [Well-known text](https://en.wikipedia.org/wiki/Well-known_text_representation_of_geometry) format:

```javascript
const stationKeyName = `station:${station.abbr.toLowerCase()}`;

await redisClient.json.set(
  stationKeyName, 
  '$',
  {
    ...station,
    // Add a WKT representation of the station's position.
    position: `POINT(${station.longitude} ${station.latitude})`
  }
);
```

The data loader script also creates the search index.  It first deletes any previous index definition, then runs the [`FT.CREATE`](https://redis.io/commands/ft.create/) command:

```javascript
await redisClient.sendCommand([
  'FT.CREATE', 'idx:stations', 'ON', 'JSON', 'PREFIX', '1', 'station:', 'SCHEMA', '$.name', 'AS', 'name', 'TAG', '$.description', 'AS', 'description', 'TEXT', '$.parking', 'AS', 'parking', 'TAG', '$.lockers', 'AS', 'lockers', 'TAG', '$.bikeRacks', 'AS', 'bikeRacks', 'TAG', '$.city', 'AS', 'city', 'TAG', '$.county', 'AS', 'county', 'TAG', '$.position', 'AS', 'position', 'GEOSHAPE', 'SPHERICAL'
]);
```

The schema tells Redis Stack's Search capability to index the data as follows:

* `name`: `TAG` (exact matches)
* `description`: `TEXT` (full text search)
* `parking`: `TAG` (exact matches)
* `lockers`: `TAG` (exact matches)
* `bikeRacks`: `TAG` (exact matches)
* `city`: `TAG` (exact matches)
* `county`: `TAG` (exact matches)
* `position`: `GEOSHAPE SPHERICAL` (this is a new indexing type in the 7.2 release.  `GEOSHAPE` tells Search to expect the value of this field to be in Well-known text format and `SPHERICAL` tells it that we are using the geographical longitude, latitude co-ordinate system)

Once the index is created, Redis Stack automatically indexes the existing documents and tracks changes to them for us.  Therefore we don't need to write code to maintain the index.

Note that we're using the generic `sendCommand` function here as node-redis doesn't yet support the `GEOSHAPE` syntax in its more idiomatic `ft.create` implementation.  I'll revisit this code when this changes.

### Serving a Map and Defining the Polygon

The front end uses [Leaflet maps](https://leafletjs.com/) with the [OpenStreetMap](https://www.openstreetmap.org/) tile layer.  It's beyond the scope of this document to explain how this works - if you're curious check out Leaflet's [quick start](https://leafletjs.com/examples/quick-start/).  At a high level, we load the JavaScript and configure a map to appear in a given `div` on the page by providing the ID of the `div`, a lat/long centre point for the map and an initial zoom level:

```javascript
const myMap = L.map('mapid').setView([37.6180849, -122.151884], 10);

L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', 
  {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }
).addTo(myMap);
```

We also need two different coloured markers for the map - I'm using red ones for the points of the user's search polygon that they'll draw and blue ones for the stations that are shown as search results.  We're using off the shelf marker images, configured like this:

```javascript
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
```

We need the user to be able to click on the map, and to drop a marker where they click.  The markers should be movable after they've been placed at their initial location, and when there are three or more of them we need to draw a polygon on the map whose points are the locations of all of the markers.

Leaflet makes this fairly easy.  Detecting clicks on the map is handed by an event listener:

```javascript
myMap.on('click', (e) => {
  // Code to handle event here...
  // Lat/Long that was clicked is available as e.latlng
});
```

Whenever there's a click on the map, we add a marker like so:

```javascript
const newMarker = L.marker(e.latlng, { 
  icon: redIcon, 
  draggable: true 
});

newMarker.addTo(myMap);
```

The marker is configured to be draggable... whenever it moves, we'll need to know about that and that's a simple matter of adding an event handler:

```javascript
// Run the updatePolygon function whenever this marker moves.
newMarker.on('move', () => updatePolygon());
```

Whenever a new marker is first added, we also run the `updatePolygon` function to determine if we should draw a polygon or update an existing one.  The markers are also tracked by adding them to a `currentMarkers` array - used to clear them from the map when the user resets the state.

The `updateMarker` function handles:

* When to draw the polygon.
* Updating it as markers are moved around.

Let's see how it does this...

```javascript
function updatePolygon() {
  if (currentMarkers.length > 2) {
    const polyCoords = currentMarkers.map((marker) => [ 
      marker.getLatLng().lat, 
      marker.getLatLng().lng 
    ]);

    if (currentPolygon) {
      myMap.removeLayer(currentPolygon);
    }
    
    currentPolygon = L.polygon(polyCoords, {color: 'red', weight: 2, fill: true, stroke: false}).addTo(myMap);
  }
}
```

Remember that each marker was added to the `currentMarkers` array on creation.  The first thing to do is to check the length of this array... if there's 3 or more markers, then there's something to do (adding a polygon with 1 or 2 points doesn't make sense).

Once we have at least 3 markers, we can grab their co-ordinates and add a [Leaflet polygon](https://leafletjs.com/reference.html#polygon) to the map.  The constructor for this takes an array of `[lat, lng]` pairs, so we create one of those using `map` over each marker in the `currentMarkers` array.

Then all that remains is to remove any existing previous polygon, add the new one setting some styles as we go, and keep a reference to it in the `currentPolygon` variable.

This function is called any time a marker is added to the map, or an existing marker is moved.

The map also contains some buttons to initiate the search, reset the state and toggle additional search criteria - do we want results that have parking, bike lockers, bike racks.  We won't cover how the button presses are handled here, see `static/js/app.js` if you want to look at this.

### Searching for Stations that meet the Criteria

When the user clicks the "Search" button in the frontend, we need to get the details of the polygon that they've drawn on the map and send that to the backend along with the status of the toggle buttons for parking, lockers and bike racks.

Conveniently, Leaflet's Polygon object offers a `toGeoJSON` function that we can use to get a JSON representation of the polygon's co-ordinates.  Whilst this isn't the Well-known Text format that we'll need to perform the actual search in the backend, it's a format that can be easily translated on the server.

We can figure out whether or not the toggle buttons are on or off by checking for the presence of the class that dims their appearance when turned off.

Here's how we make a `POST` request to the backend to ask it to perform the search (source contained in `static/js/app.js`):

```javascript
const response = await fetch('/search', {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    polygon: currentPolygon.toGeoJSON(),
    parking: ! parkingBtn.classList.contains(TOGGLE_OFF_CLASS),
    lockers: ! lockersBtn.classList.contains(TOGGLE_OFF_CLASS),
    bikeRacks: ! racksBtn.classList.contains(TOGGLE_OFF_CLASS)
  })
});

const responseJSON = await response.json();
```

The backend receives the data in the request body as a GeoJSON object.  As we need a Well-known Text format representation of the polygon to perform a search, we use the [`wellknown` package]() to transform it for us:

```javascript
const wktString = wellknown.stringify(req.body.polygon);
```

Depending on whether any of the additional properties were checked in the front end, we might also need additional search clauses for parking, lockers and/or bike racks. 

These fields are all indexed as `TAG`, so the search syntax for them is `@fieldName:{value}`.  Placing multiple such clauses in the search query separated by spaces acts as an `AND` operator.  Building this part of the search query is pretty straightforward:

```javascript
const featuresClause = `${req.body.parking ? '@parking:{true}' : ''} ${req.body.lockers ? '@lockers:{true}' : ''} ${req.body.bikeRacks ? '@bikeRacks:{true}' : ''}`.trim();
```

Now we have the WKT representation of the polygon and any other clauses, all that remains is to build up an array of strings representing the full search command:

```javascript
const searchCommand = [ 
  'FT.SEARCH', 'idx:stations', `@position:[within $poly] ${featuresClause}`, 'PARAMS', '2', 'poly', wktString, 'DIALECT', '3', 'LIMIT', '0', '100'
];
```

Here we're saying "find me stations within the polygon I'm providing which also have all of the features in the `featuresClause` string and return up to 100 matches".  When working with this lower level interface, we also have to specify `DIALECT 3` (or greater) to use the correct search syntax dialect for polygon search.

In a future update to node-redis, the polygon search syntax will be supported directly by the more idiomatic `ft.search` command wrapper, and I'll revisit this code and update / simplify it accordingly.

Read on to see how the backend transforms the response from Redis Stack, returns it to the front end and how the stations get added as markers on the map...

### Displaying Search Results on the Map

As we're using the generic `sendCommand` function in node-redis at the moment, the search results are delivered to us in the same format that Redis Stack uses (RESP).  In future versions of node-redis with support for `GEOSHAPE` searches, this can be replaced with the more idiomatic `ft.search` command that will transform the response into a more useful format for us automatically.  I'll revisit this project when that is released.

Here's what the response looks like for now:

```javascript
[
  6,
  'station:sbrn',
  [
    '$',
    `[{"name":"San Bruno","abbr":"SBRN","latitude":37.637761,"longitude":-122.416287,"description":"San Bruno Station is next to...","parking":"true","lockers":"true","bikeRacks":"true","city":"San Bruno","county":"sanmateo","position":"POINT(-122.416287 37.637761)"}]`
  ],
  'station:balb',
  [
    '$',
    `[{"name":"Balboa Park","abbr":"BALB","latitude":37.721585,"longitude":-122.447506,"description":"Balboa Park is the name of both...","parking":"false","lockers":"false","bikeRacks":"true","city":"San Francisco","county":"sanfrancisco","position":"POINT(-122.447506 37.721585)"}]`
  ],
  ...  
]
```

The code transforms the search response from Redis Stack into a format that's easier for the front end to work with - an array of objects.  The front end receives the following JSON:

```json
{
  "data": [
    {
      "key": "station:sbrn",
      "name": "San Bruno",
      "abbr": "SBRN",
      "latitude": 37.637761,
      "longitude": -122.416287,
      "description": "San Bruno Station is next to...",
      "parking": "true",
      "lockers": "true",
      "bikeRacks": "true",
      "city": "San Bruno",
      "county": "sanmateo",
      "position": "POINT(-122.416287 37.637761)"
    },
    ...
  ]
}
```

We could save a little bandwith by removing the `position` and `county` fields, as the front end doesn't use them.  It uses the `latitude` and `longitude` fields to plot matches on the map, and the others to build the informational popup about the station.

Recall that in the front end we used the `fetch` API to make a `POST` request to `/search`, passing it our search polygon and toggle switch statuses as inputs.  Picking up where we left off, we get the JSON response:

```javascript
const responseJSON = await response.json();
```

For each station object inside the `data` array returned (if no stations match we just get an empty array), we need to add a marker to the map, along with a popup containing information received about the station.

This is fairly simple with Leaflet's API.  Note that we also keep an array of all search result markers in `searchResultMarkers`... this is so that we can remove them the next time the user performs a search.  As a bit of a visual flourish, we're using [Fontawesome icons](https://fontawesome.com/) for red and green check marks to show whether parking, lockers, bike racks are present at the station.

```javascript
const responseJSON = await response.json();

responseJSON.data.map((station) => {
  const stationMarker = L.marker({ lat: station.latitude, lng: station.longitude }, { 
    icon: blueIcon
  });

  const falseIcon = '<i class="fas fa-check-circle fa-lg" style="color:#f14668"></i>';
  const trueIcon = '<i class="fas fa-check-circle fa-lg" style="color:#48c78e"></i>';

  stationMarker.bindPopup(`<p><b style="font-size:1.5em">${station.name}</b></p><p><ul><li>${station.parking === 'true' ? trueIcon : falseIcon} <b>Parking</b></li><li>${station.bikeRacks === 'true' ? trueIcon : falseIcon} <b>Bike Racks</b></li><li>${station.lockers === 'true' ? trueIcon : falseIcon} <b>Bike Lockers</b></li></ul></p><hr/><p>${station.description}</p>`).openPopup();
  stationMarker.addTo(myMap);
  searchResultMarkers.push(stationMarker);
});
```

## Questions / Ideas / Feedback?

If you have any questions about this, or fun ideas for how to use polygon search in your application we'd love to hear from you.  Find the Redis Developer Relations team and thousands of other Redis developers like you on the [official Redis Discord](https://discord.gg/redis).

If you find a bug please [raise an issue on GitHub](https://github.com/redis-developer/redis-polygon-search-trains-demo/issues) and we'll work to fix it.

## Additional Resources

If you'd like to learn more about the technologies and approaches used here, check out these links...

* [Redis Polygon Search Weather Demo](https://github.com/redis-developer/redis-polygon-search-weather-demo): another demo project that shows how to search for areas represented by polygons contained inside a search polygon.  It also contains a demonstration of how to search for which polygon contains a given lat/long point.  This is written in Python.
* [RU204 Storing, Querying, and Indexing JSON at Speed](https://university.redis.com/courses/ru204/): a free online course at Redis University.
* The [Node-Redis client](https://github.com/redis/node-redis).
* [Search and Query in Redis Stack](https://redis.io/docs/interact/search-and-query/) (redis.io).
* The [`FT.CREATE`](https://redis.io/commands/ft.create/) command (redis.io).
* The [`FT.SEARCH`](https://redis.io/commands/ft.search/) command (redis.io).
* [ExpressJS](https://expressjs.com/): A web application framework for Node.js.
* The [Bulma CSS Framework](https://bulma.io/).
* [Leaflet](https://leafletjs.com/): A JavaScript library for interactive maps.