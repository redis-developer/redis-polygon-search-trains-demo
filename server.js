import 'dotenv/config';
import express from 'express';
import { createClient } from 'redis';

// TODO .env file stuff...
const { PORT, REDIS_URL } = process.env;

// Create a Redis client with details from the environment file.
const redisClient = createClient({
  url: REDIS_URL
});

// Initialize Express.
const app = express();
app.set('views', new URL('./views', import.meta.url).pathname);
app.set('view engine', 'ejs');
app.use(express.static('static'));
app.use(express.json());

// Connect to Redis.
await redisClient.connect();

// Serve the home page.
app.get('/', async (req, res) => {
  return res.render('homepage');
});

// Perform a polygon search and return the results.
// Expects the body to be a GeoJSON representation:
// https://en.wikipedia.org/wiki/GeoJSON
app.post('/search', async (req, res) => {
  // Example query:
  // FT.SEARCH idx:stations "@position:[within $poly]" RETURN 1 name PARAMS 2 poly "POLYGON((-122.387096 37.724491, -122.360487 38.802250, -122.521058 37.800800, -122.505826 37.705039, -122.387096 37.724491))" DIALECT 3
  const polyCoordinates = req.body.polygon.geometry.coordinates[0];
  let wktPolygon = 'POLYGON((';

  for (let n = 0; n < polyCoordinates.length; n++) {
    wktPolygon = `${wktPolygon}${polyCoordinates[n][0]} ${polyCoordinates[n][1]}${n == polyCoordinates.length -1 ? '))' : ','}`;
  }

  let featuresClause = '';
  if (req.body.parking === true) {``
    featuresClause = '@parking:{true}';
  }

  if (req.body.lockers === true) {
    featuresClause = `${featuresClause} @lockers:{true}`;
  }

  if (req.body.bikeRacks === true) {
    featuresClause = `${featuresClause} @bikeRacks:{true}`;
  }

  const searchCommand = [ 
    'FT.SEARCH', 'idx:stations', `@position:[within $poly] ${featuresClause.trim()}`, 'PARAMS', '2', 'poly', wktPolygon, 'DIALECT', '3', 'LIMIT', '0', '100'
  ];

  const searchResponse = (await redisClient.sendCommand(searchCommand));
  const matchingStations = [];

  if (searchResponse[0] > 0) {
    for (let n = 1; n < searchResponse.length; n += 2) {
      matchingStations.push({
        key: searchResponse[n],
        ...(JSON.parse(searchResponse[n+1][1])[0])
      })
    }
  }

  return res.json({
    data: matchingStations
  });
});

// Start the Express server.
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}.`);
});