# Capa geo real (OSM) → `MAP_GEO`

Geometría real de OpenStreetMap para que los **parques sigan su contorno exacto** (no rectángulos
a mano) y se dibujen las **avenidas ruidosas**. Origen: design handoff `Habita (1).zip`, adaptado
para Pueblo Libre, Lima (con recorte por BBOX, porque el nombre matchea distritos homónimos).

## Generar `map_geo.json`
```bash
python3 osm/build_map_geo.py --out map_geo.json          # parques + avenidas
python3 osm/build_map_geo.py --no-roads --out map_geo.json  # solo parques
```
Formato:
```json
{
  "parks":   [ { "name": "Parque El Carmen", "poly": [[-12.076,-77.069], ...] } ],
  "stroads": [ { "name": "Av. Simón Bolívar", "severity": "HIGH", "path": [[...],[...]] } ]
}
```
- `parks[].poly`  → `[lat,lng]` (Leaflet cierra el polígono).
- `stroads[].path`→ `[lat,lng]`; `severity` = `HIGH` (grosor 5) | `MODERATE` (grosor 3).

## Cómo entra al mapa
`map_template.html` tiene el centinela:
```html
<script>window.MAP_GEO = /*__MAP_GEO__*/{}/*__/MAP_GEO__*/;</script>
```
`build_map.py` lo reemplaza con el contenido de `map_geo.json` al generar `map.html` (igual que
`map_data.json`). El render (en map_template.html) dibuja parques (verde plano bajo los pines) y
avenidas, y la leyenda los incluye. Si no existe `map_geo.json`, el mapa simplemente no dibuja la capa.

## Notas
- El recorte BBOX (en `build_map_geo.py`) descarta parques/avenidas de otros "Pueblo Libre".
- Relations multipolígono se omiten (la mayoría de parques de PL son ways simples).
- Cachea `map_geo.json` en el repo; no hace falta llamar a Overpass en cada build.
