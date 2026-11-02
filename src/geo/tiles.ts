export type MapStyle = "satellite" | "map";
export const MAP_STYLES: readonly MapStyle[] = ["satellite", "map"];

type Basemap = {
  url: string;
  options: { attribution: string; maxZoom: number };
  /** The route line: white shows on dark imagery, the site's blue on a light street map. */
  routeColor: string;
};

export const BASEMAPS: Record<MapStyle, Basemap> = {
  // Esri World Imagery: keyless satellite basemap; attribution is required.
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community",
      maxZoom: 18,
    },
    routeColor: "#ffffff",
  },
  // Esri World Street Map: keyless street basemap from the same service; attribution is required.
  // (CARTO's basemaps were the first choice, but they now need an API key.)
  map: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    options: {
      attribution:
        "Tiles &copy; Esri &mdash; Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, " +
        "Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, &copy; OpenStreetMap contributors, and the GIS User Community",
      maxZoom: 19,
    },
    routeColor: "#2147d6",
  },
};
