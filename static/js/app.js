const myMap = L.map('mapid').setView([37.6570598, -122.2636107], 10);
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const searchBtn = document.getElementById('searchBtn');
const resetBtn = document.getElementById('resetBtn');
const racksBtn = document.getElementById('racksBtn');
const lockersBtn = document.getElementById('lockersBtn');
const parkingBtn = document.getElementById('parkingBtn');

const allBtns = [ searchBtn, resetBtn, racksBtn, lockersBtn, parkingBtn ];
const toggleBtns = [ racksBtn, lockersBtn, parkingBtn ];

// Initialize the buttons.
allBtns.map((b) => b.disabled = true);

const TOGGLE_OFF_CLASS = 'is-light';
toggleBtns.map((b) => b.classList.add(TOGGLE_OFF_CLASS));

let currentMarkers = [];
let searchResultMarkers = [];
let currentPolygon = null;

toggleBtns.map((b) => { b.onclick = function () {
  this.classList.toggle(TOGGLE_OFF_CLASS);
}});

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
  allBtns.map((b) => b.disabled = true);
  toggleBtns.map((b) => b.classList.add(TOGGLE_OFF_CLASS));
};

searchBtn.onclick = async function () {
  // No need to check if there are enough points, as the 
  // button isn't clickable until there are.
  searchBtn.classList.add('is-loading');
  
  // Remove previous results.
  for (const marker of searchResultMarkers) {
    myMap.removeLayer(marker);
  }

  searchResultMarkers = [];

  try {
    // Call the search endpoint.
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
  } catch (e) {
    console.log(e);
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
    allBtns.map((b) => b.disabled = false);
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