const myMap = L.map('mapid').setView([37.6570598, -122.2636107], 10);
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const searchBtn = document.getElementById('searchBtn');
const resetBtn = document.getElementById('resetBtn');

resetBtn.disabled = true;
searchBtn.disabled = true;

let currentMarkers = [];
let searchResultMarkers = [];
let currentPolygon = null;

resetBtn.onclick = function () {
  if (currentPolygon) {
    myMap.removeLayer(currentPolygon);
    currentPolygon = null;
  }

  for (const marker of currentMarkers) {
    myMap.removeLayer(marker);
  }

  for (const marker of searchResultMarkers) {
    myMap.removeLayer(marker);
  }

  currentMarkers = [];
  searchResultMarkers = [];
  searchBtn.disabled = true;
  resetBtn.disabled = true;
};

searchBtn.onclick = async function () {
  // TODO get the points for the polygon...
  // TODO search!
  // No need to check if there are enough points, as the 
  // button isn't clickable until there are.
  searchBtn.classList.add('is-loading');

  // Get the polygon points...

  try {
    // Call the search endpoint.
    const response = await fetch('/search', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({"todo": true})
    });

    const responseJSON = await response.json();
    console.log(responseJSON);
  } catch (e) {
    alert('TODO error handling');
  }

  searchBtn.classList.remove('is-loading');
}

function updatePolygon() {
  if (currentMarkers.length > 2) {
    const polyCoords = currentMarkers.map((marker) => [ 
      marker.getLatLng().lat, 
      marker.getLatLng().lng 
    ]);

    if (currentPolygon) {
      myMap.removeLayer(currentPolygon);
    }
    
    currentPolygon = L.polygon(polyCoords, {color: 'red'}).addTo(myMap);
    searchBtn.disabled = false;
  }
}

L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', 
  {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }
).addTo(myMap);

myMap.on('click', (e) => {
  const newMarker = L.marker(e.latlng, { 
    icon: redIcon, 
    draggable: true 
  });

  newMarker.addTo(myMap);
  newMarker.on('move', () => updatePolygon());
  currentMarkers.push(newMarker);  
  updatePolygon();

  resetBtn.disabled = false;
});