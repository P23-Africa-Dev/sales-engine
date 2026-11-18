import type { StyleSpecification } from 'maplibre-gl';

/** Light, line-focused basemap shared by the demo and the client maps. */
export function createGreenStreetStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      streets: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#fcfcfb' } },
      { id: 'parks', type: 'fill', source: 'streets', 'source-layer': 'landcover',
        filter: ['in', 'class', 'wood', 'grass'],
        paint: { 'fill-color': '#eef7e8', 'fill-opacity': 0.65 } },
      { id: 'park-landuse', type: 'fill', source: 'streets', 'source-layer': 'landuse',
        filter: ['in', 'class', 'park', 'recreation_ground', 'garden'],
        paint: { 'fill-color': '#e7f5d9', 'fill-opacity': 0.65 } },
      { id: 'water', type: 'fill', source: 'streets', 'source-layer': 'water',
        paint: { 'fill-color': '#d8eff8' } },
      { id: 'waterways', type: 'line', source: 'streets', 'source-layer': 'waterway',
        paint: { 'line-color': '#97d9f5', 'line-width': 1 } },
      { id: 'building', type: 'fill', source: 'streets', 'source-layer': 'building', minzoom: 13,
        paint: { 'fill-color': '#f8f8f7', 'fill-outline-color': '#ededed', 'fill-opacity': 0.65 } },
      { id: 'road-outline', type: 'line', source: 'streets', 'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'track', 'path'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#50dd48',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 6, 0.6, 11, 1.5, 14, 3.5, 17, 8, 20, 22],
        } },
      { id: 'road-interior', type: 'line', source: 'streets', 'source-layer': 'transportation', minzoom: 12,
        filter: ['in', 'class', 'tertiary', 'minor', 'service', 'track', 'path'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 12, 0.3, 14, 1, 17, 4, 20, 16] } },
      { id: 'major-road-interior', type: 'line', source: 'streets', 'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffe69a',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 6, 0.3, 11, 0.8, 14, 2, 17, 5, 20, 18] } },
      { id: 'road-labels', type: 'symbol', source: 'streets', 'source-layer': 'transportation_name', minzoom: 13,
        layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'], 'text-size': 12, 'symbol-spacing': 350 },
        paint: { 'text-color': '#47534c', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } },
      { id: 'place-labels', type: 'symbol', source: 'streets', 'source-layer': 'place',
        layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 12, 14, 16, 16] },
        paint: { 'text-color': '#52645a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },
    ],
  };
}
