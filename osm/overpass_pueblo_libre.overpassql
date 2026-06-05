// Consulta Overpass para áreas verdes de Pueblo Libre, Lima.
// Pruébala en https://overpass-turbo.eu  (botón "Run", luego "Export → GeoJSON").
// OJO: el nombre "Pueblo Libre" matchea distritos homónimos en otras regiones;
// build_map_geo.py recorta el resultado a la BBOX de Pueblo Libre, Lima.

[out:json][timeout:90];
area["name"="Pueblo Libre"]["boundary"="administrative"]->.a;
(
  way["leisure"~"^(park|garden|pitch|playground)$"](area.a);
  way["landuse"~"^(grass|recreation_ground|village_green)$"](area.a);
  relation["leisure"="park"](area.a);
);
out tags geom;

// --- Avenidas ruidosas (capa "stroads"), consulta aparte ---
// [out:json][timeout:90];
// area["name"="Pueblo Libre"]["boundary"="administrative"]->.a;
// ( way["highway"~"^(trunk|primary|secondary)$"](area.a); );
// out tags geom;
