/* =============================================
   Albany Ride Calculator — app.js
   Leaflet map, Nominatim autocomplete,
   fare engine, route drawing, WhatsApp share
   ============================================= */

'use strict';

// --------------- FARE CONFIG ---------------
const FARE = {
  BASE_FLAT: 5.00,       // flat charge for under 5 miles
  PER_MILE: 1.50,        // per-mile charge at 5+ miles
  GAS_PER_MILE: 0.10,    // gas surcharge per mile
  BASE_MILES_THRESHOLD: 5
};

// --------------- SERVICE AREA CONFIG ---------------
const MAX_RIDE_MILES = 30;           // hard cap on total route distance
const SERVICE_RADIUS_MILES = 35;     // max allowed distance of any point from Albany center
const ALBANY_LAT = 42.6526;
const ALBANY_LON = -73.7562;

// --------------- MAP SETUP ---------------
const ALBANY_CENTER = [ALBANY_LAT, ALBANY_LON]; // Albany, NY capital

const map = L.map('map', {
  center: ALBANY_CENTER,
  zoom: 11,
  zoomControl: false,
  attributionControl: false
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Custom markers
function makeMarker(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;
      background:${color};
      border:3px solid #fff;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.5)">
    </div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

let originMarker = null;
let destMarker = null;
let stopMarkers = [];
let routeLayer = null;

// --------------- STATE ---------------
let state = {
  origin: null,      // { display, lat, lon }
  destination: null,
  stops: [],         // array of { display, lat, lon }
  fareResult: null
};

// --------------- DOM REFS ---------------
const originInput       = document.getElementById('origin');
const destinationInput  = document.getElementById('destination');
const originSugg        = document.getElementById('origin-suggestions');
const destSugg          = document.getElementById('destination-suggestions');
const stopsContainer    = document.getElementById('stops-container');
const addStopBtn        = document.getElementById('add-stop-btn');
const estimateBtn       = document.getElementById('estimate-btn');
const fareAmount        = document.getElementById('fare-amount');
const fareRouteInfo     = document.getElementById('fare-route-info');
const fareBreakdown     = document.getElementById('fare-breakdown');
const shareActions      = document.getElementById('share-actions');
const whatsappTextBtn   = document.getElementById('whatsapp-text-btn');
const whatsappImgBtn    = document.getElementById('whatsapp-img-btn');
const swapBtn           = document.getElementById('swap-btn');

// --------------- NOMINATIM GEOCODING ---------------
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

async function geocode(query) {
  if (!query || query.length < 3) return [];
  try {
    // Bias towards Albany NY via viewbox
    const viewbox = "-74.3,43.2,-73.2,42.2";
    const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&viewbox=${viewbox}`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const data = await res.json();
    return data || [];
  } catch {
    return [];
  }
}

// --------------- AUTOCOMPLETE ---------------
function formatAddress(item) {
  const p = item.address;
  if (!p) return item.display_name;
  
  let title = p.amenity || p.name || p.shop || p.building || '';
  if (p.house_number && p.road) {
    if (title && title !== `${p.house_number} ${p.road}`) {
      // It's a named place (like a school), leave title alone
    } else {
      title = `${p.house_number} ${p.road}`;
    }
  } else if (p.road && !title) {
    title = p.road;
  }
  
  const city = p.city || p.town || p.village || p.municipality || p.county;
  const subtitle = [city, p.state].filter(Boolean).join(', ');
  
  if (title && subtitle) {
    if (title.includes(city)) return title; // Prevent duplicate city names
    if (subtitle.includes(title)) return subtitle;
    return `${title}, ${subtitle}`;
  }
  
  return item.display_name; // fallback to full Nominatim string
}

function buildSuggestions(listEl, results, onSelect) {
  listEl.innerHTML = '';
  if (!results.length) { 
    listEl.innerHTML = '<li style="color:#a1a1aa;text-align:center;pointer-events:none;">No results found</li>';
    listEl.classList.add('open');
    return;
  }
  
  // Dedup
  const seen = new Set();
  const uniqueResults = results.filter(r => {
    const display = formatAddress(r);
    if (!display || seen.has(display)) return false;
    seen.add(display);
    r._display = display; // cache it
    return true;
  });

  uniqueResults.slice(0, 5).forEach(r => {
    const li = document.createElement('li');
    li.textContent = r._display;

    // A simple robust click event. Because it's a static block list now, no weird timing bugs.
    li.addEventListener('click', (e) => {
      e.preventDefault();
      onSelect({ 
        display: r._display, 
        lon: parseFloat(r.lon), 
        lat: parseFloat(r.lat) 
      });
      listEl.classList.remove('open');
    });
    
    listEl.appendChild(li);
  });
  listEl.classList.add('open');
}

function bindAutocomplete(inputEl, suggestionsEl, onSelect) {
  let timer;
  
  const triggerSearch = async () => {
    const q = inputEl.value.trim();
    if (q.length < 3) { 
      suggestionsEl.classList.remove('open'); 
      return; 
    }
    
    suggestionsEl.innerHTML = '<li style="color:var(--accent);text-align:center;pointer-events:none;">⏳ Searching...</li>';
    suggestionsEl.classList.add('open');

    try {
      const results = await geocode(q);
      if (inputEl.value.trim().length >= 3) {
        buildSuggestions(suggestionsEl, results, (place) => {
          inputEl.value = place.display;
          onSelect(place);
        });
      } else {
        suggestionsEl.classList.remove('open');
      }
    } catch (err) {
      suggestionsEl.innerHTML = '<li style="color:#f87171;text-align:center;pointer-events:none;">❌ Network Error</li>';
    }
  };

  const dbounceSearch = () => {
    clearTimeout(timer);
    timer = setTimeout(triggerSearch, 300);
  };

  // Modern keyboards use input and composition, keyup covers edges.
  inputEl.addEventListener('input', dbounceSearch);
  inputEl.addEventListener('keyup', dbounceSearch);
  
  inputEl.addEventListener('focus', () => {
    if (inputEl.value.trim().length >= 3) {
      triggerSearch();
    }
  });

  // Global close listener - Use mousedown (or touchstart) to detect taps outside anywhere
  document.addEventListener('mousedown', (e) => {
    if (e.target !== inputEl && !suggestionsEl.contains(e.target)) {
      suggestionsEl.classList.remove('open');
    }
  });
  
  document.addEventListener('touchstart', (e) => {
    if (e.target !== inputEl && !suggestionsEl.contains(e.target)) {
      suggestionsEl.classList.remove('open');
    }
  }, { passive: true });
}

// Bind origin
bindAutocomplete(originInput, originSugg, (place) => {
  state.origin = place;
  placeMarker('origin', place.lat, place.lon);
  fitBounds();
});

// Bind destination
bindAutocomplete(destinationInput, destSugg, (place) => {
  state.destination = place;
  placeMarker('destination', place.lat, place.lon);
  fitBounds();
});

// --------------- MARKERS ---------------
function placeMarker(type, lat, lon) {
  if (type === 'origin') {
    if (originMarker) map.removeLayer(originMarker);
    originMarker = L.marker([lat, lon], { icon: makeMarker('#6c63ff') }).addTo(map);
  } else {
    if (destMarker) map.removeLayer(destMarker);
    destMarker = L.marker([lat, lon], { icon: makeMarker('#f97316') }).addTo(map);
  }
}

function fitBounds() {
  const points = [];
  if (state.origin) points.push([state.origin.lat, state.origin.lon]);
  if (state.destination) points.push([state.destination.lat, state.destination.lon]);
  state.stops.forEach(s => { if (s) points.push([s.lat, s.lon]); });
  if (points.length >= 2) {
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
  } else if (points.length === 1) {
    map.setView(points[0], 13);
  }
}

// --------------- SWAP ---------------
swapBtn.addEventListener('click', () => {
  const tmpDisplay = originInput.value;
  const tmpState = state.origin;
  originInput.value = destinationInput.value;
  destinationInput.value = tmpDisplay;
  state.origin = state.destination;
  state.destination = tmpState;
  // Swap markers
  if (state.origin) placeMarker('origin', state.origin.lat, state.origin.lon);
  if (state.destination) placeMarker('destination', state.destination.lat, state.destination.lon);
});

// --------------- STOPS ---------------
let stopCount = 0;

addStopBtn.addEventListener('click', () => {
  stopCount++;
  const idx = state.stops.length;
  state.stops.push(null);

  const group = document.createElement('div');
  group.className = 'stop-group';
  group.dataset.idx = idx;

  const wrapper = document.createElement('div');
  wrapper.className = 'input-wrapper';

  const icon = document.createElement('span');
  icon.className = 'input-icon';
  icon.textContent = '🟡';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = `Stop ${stopCount}`;
  input.autocomplete = 'off';
  input.id = `stop-input-${idx}`;

  const suggList = document.createElement('ul');
  suggList.className = 'autocomplete-list';
  suggList.id = `stop-suggestions-${idx}`;

  wrapper.appendChild(icon);
  wrapper.appendChild(input);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-stop-btn';
  removeBtn.innerHTML = '✕';
  removeBtn.title = 'Remove stop';

  removeBtn.addEventListener('click', () => {
    state.stops[idx] = null;
    if (stopMarkers[idx]) { map.removeLayer(stopMarkers[idx]); stopMarkers[idx] = null; }
    group.remove();
  });

  group.appendChild(wrapper);
  group.appendChild(removeBtn);
  group.appendChild(suggList);
  stopsContainer.appendChild(group);

  bindAutocomplete(input, suggList, (place) => {
    state.stops[idx] = place;
    if (stopMarkers[idx]) map.removeLayer(stopMarkers[idx]);
    stopMarkers[idx] = L.marker([place.lat, place.lon], { icon: makeMarker('#f59e0b') }).addTo(map);
    fitBounds();
  });
});

// --------------- DISTANCE (Haversine) ---------------
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function totalDistance() {
  const waypoints = [];
  if (state.origin) waypoints.push(state.origin);
  state.stops.forEach(s => { if (s) waypoints.push(s); });
  if (state.destination) waypoints.push(state.destination);
  let dist = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    dist += haversine(waypoints[i].lat, waypoints[i].lon, waypoints[i+1].lat, waypoints[i+1].lon);
  }
  return dist;
}

// --------------- SERVICE AREA VALIDATION ---------------
/**
 * Returns true if ALL waypoints in the route are within SERVICE_RADIUS_MILES
 * of Albany city center. This prevents misuse of the calculator for
 * destinations far outside the Capital Region.
 */
function isWithinServiceArea() {
  const waypoints = [];
  if (state.origin) waypoints.push(state.origin);
  state.stops.forEach(s => { if (s) waypoints.push(s); });
  if (state.destination) waypoints.push(state.destination);
  for (const wp of waypoints) {
    const d = haversine(ALBANY_LAT, ALBANY_LON, wp.lat, wp.lon);
    if (d > SERVICE_RADIUS_MILES) return false;
  }
  return true;
}

// --------------- FARE CALCULATION ---------------
function calculateFare(miles) {
  let baseFare, gasFee, total;
  if (miles < FARE.BASE_MILES_THRESHOLD) {
    baseFare = FARE.BASE_FLAT;
    gasFee = 0;
  } else {
    baseFare = FARE.PER_MILE * miles;
    gasFee = FARE.GAS_PER_MILE * miles;
  }
  total = baseFare + gasFee;
  return { baseFare, gasFee, total, miles };
}

// --------------- ROUTE POLYLINE ---------------
async function drawRoute() {
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }

  const waypoints = [];
  if (state.origin) waypoints.push(`${state.origin.lon},${state.origin.lat}`);
  state.stops.forEach(s => { if (s) waypoints.push(`${s.lon},${s.lat}`); });
  if (state.destination) waypoints.push(`${state.destination.lon},${state.destination.lat}`);

  if (waypoints.length < 2) return;

  try {
    const coordStr = waypoints.join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      routeLayer = L.geoJSON(data.routes[0].geometry, {
        style: {
          color: '#6c63ff',
          weight: 4,
          opacity: 0.85,
          dashArray: null
        }
      }).addTo(map);
      map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
      // Return OSRM distance in miles for more accuracy
      return data.routes[0].distance / 1609.34;
    }
  } catch {
    // fallback to haversine
  }
  return null;
}

// --------------- ESTIMATE BUTTON ---------------
estimateBtn.addEventListener('click', async () => {
  if (!state.origin || !state.destination) {
    shakeElement(estimateBtn);
    showToast('⚠️ Please enter both Starting Point and Destination.');
    return;
  }

  estimateBtn.textContent = '⏳ Calculating...';
  estimateBtn.disabled = true;

  // Try OSRM route first, fallback to haversine
  let miles = await drawRoute();
  if (!miles) miles = totalDistance();

  // ── 30-MILE HARD LIMIT ──────────────────────────────────────────────
  if (miles > MAX_RIDE_MILES) {
    fareAmount.textContent = 'Custom Quote';
    fareAmount.classList.add('active');
    fareAmount.style.fontSize = '2.2rem'; // smaller for text
    
    // Populate Route Info
    const originStr = sanitize(originInput.value.trim());
    const destStr = sanitize(destinationInput.value.trim());
    const stopsStr = state.stops.filter(Boolean).map(s => sanitize(s.display)).join(' → ');

    let routeHTML = `<div class="route-row"><span class="icon">📍</span><span><strong>From:</strong> ${originStr}</span></div>`;
    if (stopsStr) {
      routeHTML += `<div class="route-row"><span class="icon">🔄</span><span><strong>Via:</strong> ${stopsStr}</span></div>`;
    }
    routeHTML += `<div class="route-row"><span class="icon">🏁</span><span><strong>To:</strong> ${destStr}</span></div>`;
    
    fareRouteInfo.innerHTML = routeHTML;
    fareRouteInfo.style.display = 'block';

    fareBreakdown.innerHTML = `
      📏 Distance: <strong>${miles.toFixed(1)} miles</strong><br><br>
      🚕 <strong>Long Distance Request:</strong> This ride exceeds our standard 30-mile range. Please post it as a request, and a driver will respond to negotiate a price directly with you.
    `;
    
    // Enable WhatsApp but with a special layout
    shareActions.style.display = 'flex';
    whatsappTextBtn.onclick = () => shareLongDistanceOnWhatsAppText(miles);
    whatsappImgBtn.onclick = () => shareAsImage();

    estimateBtn.textContent = '🔍 Get Fare Estimate';
    estimateBtn.disabled = false;
    return;
  }
  
  fareAmount.style.fontSize = ''; // reset to CSS default

  const result = calculateFare(miles);
  state.fareResult = { ...result };

  // Animate fare display
  fareAmount.textContent = `$${result.total.toFixed(2)}`;
  fareAmount.classList.add('active');

  // Populate Route Info
  const originStr = sanitize(originInput.value.trim());
  const destStr = sanitize(destinationInput.value.trim());
  const stopsStr = state.stops.filter(Boolean).map(s => sanitize(s.display)).join(' → ');

  let routeHTML = `<div class="route-row"><span class="icon">📍</span><span><strong>From:</strong> ${originStr}</span></div>`;
  if (stopsStr) {
    routeHTML += `<div class="route-row"><span class="icon">🔄</span><span><strong>Via:</strong> ${stopsStr}</span></div>`;
  }
  routeHTML += `<div class="route-row"><span class="icon">🏁</span><span><strong>To:</strong> ${destStr}</span></div>`;
  
  fareRouteInfo.innerHTML = routeHTML;
  fareRouteInfo.style.display = 'block';

  let breakdown = `📏 Distance: <strong>${miles.toFixed(1)} miles</strong><br>`;

  if (miles < FARE.BASE_MILES_THRESHOLD) {
    breakdown += `💵 Base flat fare (under 5 mi): <strong>$${result.baseFare.toFixed(2)}</strong><br>`;
    breakdown += `⛽ Gas surcharge: <strong>$0.00</strong> (flat rate)`;
  } else {
    breakdown += `💵 Base ($1.50 × ${miles.toFixed(1)} mi): <strong>$${result.baseFare.toFixed(2)}</strong><br>`;
    breakdown += `⛽ Gas surcharge ($0.10 × ${miles.toFixed(1)} mi): <strong>$${result.gasFee.toFixed(2)}</strong>`;
  }

  fareBreakdown.innerHTML = breakdown;

  // Enable WhatsApp
  shareActions.style.display = 'flex';
  whatsappTextBtn.onclick = () => shareOnWhatsAppText(result, miles);
  whatsappImgBtn.onclick = () => shareAsImage();

  estimateBtn.textContent = '🔍 Get Fare Estimate';
  estimateBtn.disabled = false;
});

// --------------- WHATSAPP SHARE ---------------
function sanitize(str) {
  return String(str).replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').substring(0, 120);
}

// 1) Text Share
function shareOnWhatsAppText(result, miles) {
  const origin = sanitize(originInput.value.trim()) || 'Unknown';
  const dest = sanitize(destinationInput.value.trim()) || 'Unknown';
  
  // Format Ride Time nicely if provided
  let timeStr = document.getElementById('ride-time').value || '';
  if (timeStr) {
    const [h, m] = timeStr.split(':');
    const dn = h >= 12 ? 'PM' : 'AM';
    const hr12 = h % 12 || 12;
    timeStr = `${hr12}:${m} ${dn}`;
  }

  const stops = state.stops.filter(Boolean).map(s => sanitize(s.display)).join(' → ');

  let msg = `🚗 ARC Ride Request\n━━━━━━━━━━━━━━━━━━\n`;
  msg += `📍 From: ${origin}\n`;
  if (stops) msg += `🔄 Via: ${stops}\n`;
  msg += `🏁 To: ${dest}\n`;
  if (timeStr) msg += `🕐 Time: ${timeStr}\n`;
  
  msg += `💰 Fare: ~$${result.total.toFixed(2)} (${miles.toFixed(1)} mi)\n`;
  
  if (result.gasFee > 0) {
    msg += `⛽ Fuel Surcharge (Temporary): +$${result.gasFee.toFixed(2)} ($0.10/mi — due to rising fuel prices)\n`;
  }
  
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  const encoded = encodeURIComponent(msg);
  window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
}

// 1.5) Long Distance Text Share
function shareLongDistanceOnWhatsAppText(miles) {
  const origin = sanitize(originInput.value.trim()) || 'Unknown';
  const dest = sanitize(destinationInput.value.trim()) || 'Unknown';
  
  let timeStr = document.getElementById('ride-time').value || '';
  if (timeStr) {
    const [h, m] = timeStr.split(':');
    const dn = h >= 12 ? 'PM' : 'AM';
    const hr12 = h % 12 || 12;
    timeStr = `${hr12}:${m} ${dn}`;
  }

  const stops = state.stops.filter(Boolean).map(s => sanitize(s.display)).join(' → ');

  let msg = `🚕 ARC Long Distance Request\n━━━━━━━━━━━━━━━━━━\n`;
  msg += `📍 From: ${origin}\n`;
  if (stops) msg += `🔄 Via: ${stops}\n`;
  msg += `🏁 To: ${dest}\n`;
  if (timeStr) msg += `🕐 Time: ${timeStr}\n`;
  
  msg += `📏 Distance: ${miles.toFixed(1)} mi\n\n`;
  msg += `*Note:* This ride exceeds the standard 30-mile range. Please respond to negotiate a direct price with me!\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `Book via: https://albany-ride-calculator.netlify.app`;

  // Fix: Some mobile browsers truncate WhatsApp links on certain encoded characters 
  // if not cleanly formed. We ensure full URI encoding.
  const encoded = encodeURIComponent(msg);
  window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
}

// 2) Image Share (html2canvas)
async function shareAsImage() {
  const card = document.getElementById('fare-card');
  const oldText = whatsappImgBtn.textContent;
  whatsappImgBtn.textContent = '⏳ Capturing...';
  
  try {
    // Hide buttons temporarily for the screenshot
    shareActions.style.display = 'none';
    
    const canvas = await html2canvas(card, {
      backgroundColor: '#1c1c28',
      scale: 2, 
      logging: false
    });
    
    // Restore buttons
    shareActions.style.display = 'flex';
    
    canvas.toBlob(async (blob) => {
      const file = new File([blob], 'arc-ride-estimate.png', { type: 'image/png' });
      
      // Try Native Share API first (Mobile)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'ARC Ride Estimate',
            text: 'Check out this fare estimate from Albany Ride Calculator!'
          });
          whatsappImgBtn.textContent = oldText;
          return; // Success
        } catch (e) {
          console.warn('Share API failed or cancelled', e);
        }
      }
      
      // Fallback: Download the image (Desktop)
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'arc-ride-estimate.png';
      a.click();
      URL.revokeObjectURL(url);
      showToast('📸 Image saved! You can now attach it in WhatsApp.');
      
      whatsappImgBtn.textContent = oldText;
    }, 'image/png');
    
  } catch (err) {
    console.error('html2canvas error:', err);
    shareActions.style.display = 'flex';
    whatsappImgBtn.textContent = oldText;
    showToast('⚠️ Could not capture image.');
  }
}

// --------------- HELPERS ---------------
function shakeElement(el) {
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake 0.4s ease';
  setTimeout(() => el.style.animation = '', 500);
}

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position:fixed;bottom:30px;left:50%;transform:translateX(-50%);
      background:#1c1c28;border:1px solid rgba(108,99,255,0.4);
      color:#f0f0f8;padding:12px 22px;border-radius:10px;
      font-size:0.85rem;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,0.5);
      font-family:'Inter',sans-serif;animation:fadeIn 0.3s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3500);
}

/** Shows a styled error banner when route exceeds 30 miles */
function showRangeLimitError(miles) {
  let el = document.getElementById('range-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'range-error';
    el.style.cssText = `
      background: rgba(239,68,68,0.12);
      border: 1px solid rgba(239,68,68,0.45);
      border-radius: 10px; padding: 14px 16px;
      font-size: 0.84rem; color: #fca5a5;
      margin-top: 10px; line-height: 1.6;
      font-family:'Inter',sans-serif;
    `;
    document.getElementById('fare-card').appendChild(el);
  }
  el.innerHTML = `
    🚕 <strong style="color:#f87171">Route exceeds standard range (${miles.toFixed(1)} mi)</strong><br>
    Albany Ride Calculator serves regular rides up to 30 miles. For longer trips, post a custom request.
  `;
  el.style.display = 'block';
  setTimeout(() => { if(el) el.style.display = 'none'; }, 7000);
}

// Inject shake + fadeIn keyframes
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%,100%{transform:translateX(0)}
    20%{transform:translateX(-6px)}
    40%{transform:translateX(6px)}
    60%{transform:translateX(-4px)}
    80%{transform:translateX(4px)}
  }
  @keyframes fadeIn {
    from{opacity:0;transform:translateX(-50%) translateY(10px)}
    to{opacity:1;transform:translateX(-50%) translateY(0)}
  }
`;
document.head.appendChild(style);
