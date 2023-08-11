import 'dotenv/config';
import { createClient } from 'redis';
import { XMLParser } from 'fast-xml-parser';
import { readFile } from 'fs/promises';

const { REDIS_URL } = process.env;
// TODO make the file configurable

const dataBuf = await readFile('data/stations.kml');
const parser = new XMLParser();
const xmlObj = parser.parse(dataBuf);
const stations = xmlObj.kml.Document.Placemark;

// Create a Redis client with details from the environment file.
const redisClient = createClient({
  url: REDIS_URL
});

// Connect to Redis.
await redisClient.connect();

// Write each station's information to a JSON document in Redis.
for (const station of stations) {
  const stationName = station.name;
  const stationKeyName = `station:${stationName.replaceAll(' ', '_').replaceAll('/', '_').toLowerCase()}`;
  const [lng, lat] = station.Point.coordinates.split(',');

  await redisClient.json.set(
    stationKeyName, 
    '$',
    {
      name: station.name,
      position: `POINT(${lng} ${lat})`
    }
  );

  console.log(`Stored ${station.name} as ${stationKeyName}`);
}

// Done with Redis now.
await redisClient.disconnect();
