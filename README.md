# Habita · Pueblo Libre, Lima

Buscador inmobiliario con un **mapa interactivo** y un **puntaje de habitabilidad (0–100)** que se
recalcula por propiedad según las **prioridades del usuario** (perfil + filtros). El mapa se "pinta"
según qué tan bien viviría *esa* persona en *esa* propiedad — no solo según precio.

**🔗 Mapa en vivo (GitHub Pages):** se publica desde `index.html` (ver la pestaña *Settings → Pages*).

## Qué hay acá
| Archivo | Qué es |
|---|---|
| `index.html` | El mapa final autocontenido (HTML + CSS + JS vanilla + Leaflet). Lo que ves en vivo. |
| `map_template.html` | La plantilla; `build_map.py` le inyecta los datos para generar el HTML. |
| `map_data.json` | 68 propiedades reales (Urbania) + sub-scores del motor de puntaje. |
| `map_geo.json` | Geometría real de OSM: parques, colegios, salud, avenidas ruidosas. |
| `rank.py` | Motor de puntaje (9 factores ponderados desde OSM + datos de listings). |
| `build_map.py` | Arma `index.html` inyectando `map_data.json` + `map_geo.json` en la plantilla. |
| `osm/` | Tooling para traer parques/colegios/salud/avenidas de OpenStreetMap (Overpass). |
| `CONTEXT.md` | Contexto del proyecto (diseño, datos, scoring, estado) — para el Proyecto de claude.ai. |

## Cómo se reconstruye
```bash
python3 osm/build_map_geo.py --out map_geo.json   # (opcional) refrescar geometría OSM
python3 build_map.py                              # genera index.html / map.html
```

## Diseño
Dirección visual **"Cálida"** (terracota/crema, serif Newsreader + Hanken Grotesk). El diseño nace
en un Proyecto de claude.ai y se finaliza acá con datos reales. Ver `CONTEXT.md`.
