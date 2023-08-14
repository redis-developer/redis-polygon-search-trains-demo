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
app.post('/search', async (req, res) => {
  // Example query:
  // FT.SEARCH idx:stations "@position:[within $poly]" RETURN 1 name PARAMS 2 poly "POLYGON((-122.387096 37.724491, -122.360487 38.802250, -122.521058 37.800800, -122.505826 37.705039, -122.387096 37.724491))" DIALECT 3

  // Results need to include station name, lat, lng.
  return res.json({ 'search': 'TODO'});
});

// Start the Express server.
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}.`);
});