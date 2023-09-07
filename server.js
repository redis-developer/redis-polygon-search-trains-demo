import 'dotenv/config';
import express from 'express';
import { createClient } from 'redis';
import wellknown from 'wellknown';

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

  const wktString = wellknown.stringify(req.body.polygon);
  const featuresClause = `${req.body.parking ? '@parking:{true}' : ''} ${req.body.lockers ? '@lockers:{true}' : ''} ${req.body.bikeRacks ? '@bikeRacks:{true}' : ''}`.trim();

  const searchCommand = [ 
    'FT.SEARCH', 'idx:stations', `@position:[within $poly] ${featuresClause}`, 'PARAMS', '2', 'poly', wktString, 'DIALECT', '3', 'LIMIT', '0', '100'
  ];

  const searchResponse = await redisClient.sendCommand(searchCommand);
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