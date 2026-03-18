# Albany Ride Calculator 🚖

A responsive, mobile-optimized web application for calculating ride estimates, custom quotes, and WhatsApp-integrated booking requests in the Albany, NY region.

## Features ✨

- **Intelligent Autocomplete:** Powered by the OpenStreetMap Nominatim API, providing highly accurate and fluidly responsive location searches.
- **Dynamic Routing:** Built with Leaflet.js and the OSRM (Open Source Routing Machine) API to instantly draw routes and parse distance/duration.
- **Accurate Pricing Algorithms:** Calculates fares using custom distance matrices. Evaluates minimum drop fees, mileage layers, and toll logic automatically.
- **WhatsApp Integration:** Generates deeply optimized deep-links formatted cleanly for drivers and dispatch, containing precise origin, destination, and calculated cost.
- **Responsive Mobile Flow:** Built specifically to conquer strict mobile viewport bugs, ensuring total fluid block consistency on iOS Safari and Android Chrome without virtual keyboard clipping.
- **Local Development Server:** Bundled with a lightweight `Server.java` for immediate local area network testing and evaluation on hardware devices.

## Tech Stack 🛠️

- **Frontend:** Vanilla HTML5, CSS3, ES6 JavaScript.
- **Mapping:** Leaflet.js (OpenStreetMap layer mapping).
- **Geocoding:** OSM Nominatim API (bypassing strict CORS limits).
- **Routing Engine:** OSRM (Open Source Routing Machine HTTP API).
- **Hosting Pipeline:** Vercel (or Netlify configured for static deployment).

## Installation & Setup 🚀

No complex build pipeline required! This project is vanilla.

1. Clone this repository to your local machine:
   ```bash
   git clone https://github.com/your-username/albany-ride-calculator.git
   ```
2. Navigate to the local directory:
   ```bash
   cd albany-ride-calculator
   ```
3. To view the application across your Local Area Network (e.g., testing on a mobile device), compile and run the included local server:
   ```bash
   javac Server.java
   java Server
   ```
4. Find your machine's local IPv4 Address (e.g., `http://192.168.x.x:8080`) and open it directly from any mobile device on your WiFi!

## Deployment 🌍

This static site was engineered to be dropped directly into Vercel or any standard static deployment service. 

To deploy using the [Vercel CLI](https://vercel.com/docs/cli):
```bash
npx vercel --prod
```

## Contributing 🤝
Contributions, issues, and feature requests are welcome. Feel free to check the issues page if you want to contribute.

## License 📜
Distributed under the MIT License. See `LICENSE` for more information.
