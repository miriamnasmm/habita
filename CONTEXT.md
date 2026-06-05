# Habita — Contexto del proyecto (para el Proyecto de claude.ai de diseño)

> **Para qué sirve este archivo:** súbelo al *Knowledge* de tu Proyecto de claude.ai (o pégalo en
> "Instrucciones del proyecto"). Resume el estado REAL de la implementación para que cualquier
> diseño/estética que generes allá encaje sin fricción con lo que ya está construido acá.
> **Última actualización:** 2026-06-04 (añadida capa MAP_GEO: parques/avenidas reales de OSM).

---

## 1. Qué es Habita
Buscador inmobiliario centrado en un **mapa** + un **"puntaje de habitabilidad" (0–100)** que se
recalcula por propiedad según las **prioridades del usuario** (perfil + filtros). Diferenciador vs
Urbania: el mapa se "pinta" según qué tan bien viviría *esta persona* en *esa* propiedad.
Alcance actual: **Pueblo Libre, Lima** (68 propiedades reales). Luego, Lima en general.

## 2. Stack real (importante para el diseño)
- **NO es React en producción.** La app vive en un **único `map.html` autocontenido**: HTML + CSS +
  **JavaScript vanilla** + **Leaflet** (mapa, tiles CARTO light). Se genera desde
  `map_template.html` inyectando los datos (`map_data.json`) en un centinela.
- Por eso, cuando entregues un diseño, lo ideal es: **tokens (CSS variables), clases CSS y
  estructura HTML** (o una descripción clara). Prototipos en React/Babel sirven de referencia, pero
  se reescriben a vanilla. Evita dependencias de framework/bundler.
- Las fotos son reales (varias por aviso → galería). El mapa y la atribución OSM/CARTO ya están.

## 3. Dirección visual ACTUAL = "Cálida" (ya implementada)
Paleta cálida terracota/crema, tipografía serif para destacados. Tokens reales en uso:

```
--clay:#C2562F  --clay-deep:#A2421F  --clay-soft:#D98A63
--espresso:#3A2218  --espresso-2:#5A3D2E
--cream:#FBF6F0  --cream-2:#F5ECE1  --cream-3:#EFE3D5
--ink:#2C1C14  --muted:#8A7466  --line:#E6D7C7  --line-2:#EADFD2  --ok:#4E8A5B
--serif:'Newsreader'  --sans:'Hanken Grotesk'
--shadow:0 10px 30px -12px rgba(58,34,24,.28)
```
Escala de color del puntaje (`scoreColor`, interpolación): 0 #963424 (arcilla) → .42 #B6452B →
.60 #D89A3F (ocre) → .78 olivo → 1 #4E8A5B (salvia). Palabras: ≥75 Excelente, ≥62 Muy buena,
≥50 Buena, ≥40 Regular, <40 Baja.

**Layout:** grid `360px sidebar(crema) + mapa`; ficha de detalle deslizante (438px) desde la
derecha; responsivo <820px (se apila, ficha como bottom-sheet, leyenda oculta).
**Componentes ya hechos:** logo casa, tarjetas de perfil, dual-range de precio, toggles de
dormitorios, "ajuste fino", leyenda flotante, pines-gota con puntaje (anillo punteado = en
construcción), **anillo de puntaje** (conic-gradient), grid de stats, CTAs "Ver aviso"/WhatsApp,
barras "¿Por qué este puntaje?", y **capa de parques reales** (polígonos OSM verde plano bajo los
pines) + **avenidas ruidosas** (líneas, severidad HIGH/MODERATE).

> Nota: hubo una versión previa **verde** (Inter, badge %); quedó respaldada pero NO es la actual.
> Si propones cambiar de paleta otra vez, dilo explícito.

## 4. Esquema de datos REAL por propiedad (lo que el diseño puede mostrar)
Campos disponibles hoy (de scraping de Urbania + OSM):
```
id, address, lat, lng, source ("urbania" | "developer_site"=proyecto en construcción),
price_usd, price_pen, area_total_m2, bedrooms, url, publisher_whatsapp, project_status,
delivery_year, thumbs[] (fotos), description
_score: composite(0-1), ppm_usd ($/m²), age_label, building_floors_est, llm_unit_floor,
        park_name/park_dist_m, stroad_nearest_name/dist/severity, metro_name/metro_dist_m,
        y los SUB-SCORES 0-1 que alimentan el puntaje (ver abajo)
```

## 5. Motor de puntaje REAL (rank.py) — 9 factores, sub-scores 0–1
`stroad`(calle tranquila) · `commerce`(comercio a pie) · `conn`(commute/conectividad) ·
`park`(parque) · `health`(salud) · `modernity`(la casa) · `cross`(caminable) · `bus`(transporte) ·
`value`(precio/m²). El puntaje = Σ(sub·peso)/Σpeso, recalculado **en vivo** en el navegador.

**Perfiles** (pesos sobre esos 9 factores), default = *Familia con niños*:
- Tranquilidad/vivir · Familia con niños · Inversión/reventa · Personalizado (5 sliders:
  Tranquilidad→stroad, Parques→park, Comercio→commerce, Transporte→conn, Precio→value).

## 6. ⚠️ Brechas de datos (diséñalo con esto en mente)
Aún NO tenemos data real de: **colegios**, **seguridad**, **servicios (agua/luz)**, **clubs**,
**malls**, **ciclovías**, **commute real al trabajo**, **riesgo sísmico/suelo**. Están en el backlog.
→ Si un diseño los muestra, hay que marcarlos "próximamente" o no inventarlos. Ej.: la barra
"Colegios" del handoff hoy se reemplaza por "Salud" (que sí es real).

## 7. Estado
- ✅ Hecho: mapa + puntaje reponderado a las prioridades del dueño, filtro de perfiles en vivo,
  rediseño "Cálida" completo (escritorio + ficha + móvil), conectado a 68 propiedades reales,
  y **capa MAP_GEO de parques + avenidas reales de OSM** (geometría real, no muestras a mano;
  herramienta en `osm/build_map_geo.py`, inyectada vía centinela `__MAP_GEO__` igual que MAP_DATA).
- ⏳ Pendiente/ideas: heatmap de comercios como toggle (opcional), recolectar más proyectos
  (preventa/construcción), volverlo multi-distrito (Lima), traer datos del backlog que NO están en
  OSM (empezando por **colegios, seguridad, servicios**).

> Nota de datos: la geometría de parques/avenidas SÍ sale de OSM (ya resuelto). Pero **colegios,
> seguridad, servicios, clubs, malls, ciclovías, commute real, sísmico** siguen sin fuente — no los
> diseñes como datos reales todavía.

## 8. Cómo entregar diseño para que encaje
1. Usa los **tokens y clases** de la sección 3 (o propón cambios explícitos sobre ellos).
2. Muestra solo **campos que existen** (sección 4) o marca lo que falta como "próximamente".
3. Entrega como **CSS + HTML/vanilla JS** o descripción precisa (evita React/bundlers en el entregable final).
4. Si tocas el puntaje, recuerda que son **9 sub-scores 0–1** ponderados por perfil (sección 5).
5. Indica comportamiento responsivo (breakpoint 820px) y estados (hover, seleccionado, vacío).
