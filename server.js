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

// Connect to Redis.
await redisClient.connect();

// Serve the home page.
app.get('/', async (req, res) => {
  return res.render('homepage');
});

// Start the Express server.
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}.`);
});