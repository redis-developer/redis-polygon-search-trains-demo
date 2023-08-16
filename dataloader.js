import 'dotenv/config';
import { createClient } from 'redis';
import { readFile } from 'fs/promises';

const { REDIS_URL } = process.env;

// Make sure we were called with a file to load...
if (process.argv.length !== 3) {
  console.log('Usage: npm run load <filename>');
  process.exit(1);
}

const dataBuf = await readFile(process.argv[2]);
const stations = JSON.parse(dataBuf.toString());

// Create a Redis client with details from the environment file.
const redisClient = createClient({
  url: REDIS_URL
});

// Connect to Redis.
await redisClient.connect();

// Write each station's information to a JSON document in Redis.
for (const station of stations.stations) {
  const stationKeyName = `station:${station.abbr.toLowerCase()}`;

  await redisClient.json.set(
    stationKeyName, 
    '$',
    {
      abbr: station.abbr,
      name: station.name,
      description: station.description,
      position: `POINT(${station.longitude} ${station.latitude})`,
      latitude: station.latitude,
      longitude: station.longitude,
      lockers: station.lockers,
      parking: station.parking,
      bikeRacks: station.bikeRacks,
      city: station.city,
      county: station.county
    }
  );

  console.log(`Stored ${station.name} as ${stationKeyName}`);
}

// Create the index, remove any previous index.
try {
  console.log('Checking for previous index and dropping if found.');
  await redisClient.ft.dropIndex('idx:stations');
} catch (e) {
  if (e.message.indexOf('Unknown Index') == -1) {
    console.log('Error:');
    console.log(e);
  } else {
    console.log('Dropped old search index.');
  }
}

// Waiting for ft.create to support this in Node Redis.
console.log('Creating index.');
await redisClient.sendCommand([
  'FT.CREATE', 'idx:stations', 'ON', 'JSON', 'PREFIX', '1', 'station:', 'SCHEMA', '$.name', 'AS', 'name', 'TAG', '$.description', 'AS', 'description', 'TEXT', '$.parking', 'AS', 'parking', 'TAG', '$.lockers', 'AS', 'lockers', 'TAG', '$.bikeRacks', 'AS', 'bikeRacks', 'TAG', '$.city', 'AS', 'city', 'TAG', '$.county', 'AS', 'county', 'TAG', '$.position', 'AS', 'position', 'GEOSHAPE', 'SPHERICAL'
]);

console.log('Done!');
await redisClient.quit();