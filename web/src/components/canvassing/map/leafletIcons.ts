import L from "leaflet"
import markerIcon from "leaflet/dist/images/marker-icon.png"
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png"
import markerShadow from "leaflet/dist/images/marker-shadow.png"

// Single source of truth for Leaflet marker icon factories across the
// CivicPulse web app. MAP-01 (plan 109-02) consolidated all icon
// construction sites here so every icon URL is fingerprinted and bundled
// by Vite — no remote CDN URLs, no drift-prone `public/leaflet/` copies.

export const voterIcon = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

export const volunteerIcon = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// Phase 108 Spike A2 — household markers use L.DivIcon so the marker root
// is a <div> that can host a ::before pseudo-element for the Contract 2b
// 44×44 hit-area expansion. Void <img> roots cannot host ::before.
export const householdIcon = new L.DivIcon({
  html: `<img src="${markerIcon}" srcset="${markerIcon2x} 2x" width="25" height="41" alt="" />`,
  className: "canvassing-map-household-marker",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

export const activeHouseholdIcon = new L.DivIcon({
  html: `<img src="${markerIcon}" srcset="${markerIcon2x} 2x" width="30" height="49" alt="" />`,
  className: "canvassing-map-household-marker canvassing-map-active-marker",
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -40],
})
