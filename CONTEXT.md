# Habita — Contexto del proyecto (para el Proyecto de claude.ai de diseño)

> **Para qué sirve este archivo:** vive en el repo `miriamnasmm/habita` (fuente de verdad). Resume el
> estado REAL de la implementación para que cualquier diseño/estética que generes encaje sin fricción.
> **Última actualización:** 2026-06-04 (Lab: colegios/salud reales, capas, pestañas, buscador; heatmap eliminado; repo + URL en vivo).

## 0. Fuente de verdad + flujo
- **Código real:** https://github.com/miriamnasmm/habita
- **Mapa final EN VIVO (previsualiza la última versión):** https://miriamnasmm.github.io/habita/
- **Loop:** diseñas/iteras partiendo SIEMPRE de la versión real (lee `map_template.html` + este archivo
  del repo) → se previsualiza → se integra con datos reales en Claude Code → se sube al repo → la URL en
  vivo se actualiza → esa URL es la referencia de la siguiente ronda. **Antes de proponer cambios, revisa
  la URL en vivo para no repetir lo ya hecho.**

---

## 1. Qué es Habita
Buscador inmobiliario centrado en un **mapa** + un **"puntaje de habitabilidad" (0–100)** que se
recalcula por propiedad según las **prioridades del usuario** (perfil + filtros). Diferenciador vs
Urbania: el mapa se "pinta" según qué tan bien viviría *esta persona* en *esa* propiedad.
Alcance actual: **Pueblo Libre, Lima** (68 propiedades reales). Luego, Lima en general (ya hay buscador
multi-distrito; otros distritos quedan "Próximamente" hasta cargar su data).

## 2. Stack real (importante para el diseño)
- **NO es React en producción.** La app vive en un **único `index.html`/`map.html` autocontenido**:
  HTML + CSS + **JavaScript vanilla** + **Leaflet**. Se genera desde `map_template.html` inyectando
  `map_data.json` (propiedades) y `map_geo.json` (geometría OSM) en centinelas.
- Entrega diseño como **tokens (CSS variables), clases CSS y estructura HTML** (o descripción clara).
  Prototipos React/Babel sirven de referencia pero se reescriben a vanilla. Sin frameworks/bundlers.

## 3. Dirección visual ACTUAL = "Cálida"
Paleta cálida terracota/crema, serif para destacados. Tokens reales:
```
--clay:#C2562F  --clay-deep:#A2421F  --clay-soft:#D98A63
--espresso:#3A2218  --espresso-2:#5A3D2E
--cream:#FBF6F0  --cream-2:#F5ECE1  --cream-3:#EFE3D5
--ink:#2C1C14  --muted:#8A7466  --line:#E6D7C7  --line-2:#EADFD2  --ok:#4E8A5B
--serif:'Newsreader'  --sans:'Hanken Grotesk'
```
Escala del puntaje (`scoreColor`): 0 #963424 (arcilla) → .42 #B6452B → .60 #D89A3F (ocre) → .78 olivo
→ 1 #4E8A5B (salvia). Palabras: ≥75 Excelente, ≥62 Muy buena, ≥50 Buena, ≥40 Regular, <40 Baja.

**Layout:** grid `360px sidebar(crema) + mapa`; ficha deslizante (438px); responsivo <820px (se apila,
ficha como bottom-sheet, leyenda oculta).
**Componentes ya hechos:**
- Sidebar: logo casa, **pestañas Prioridades / Resultados (lista)**, tarjetas de perfil, dual-range de
  precio, toggles de dormitorios, "ajuste fino".
- Mapa: base **sin etiquetas + capa de etiquetas en pane superior** (los nombres de calle quedan SOBRE
  el verde); **parques verde plano** (polígonos OSM); **avenidas ruidosas** (líneas HIGH/MODERATE);
  pines-gota con puntaje (anillo punteado = en construcción), seleccionado crece + panTo.
- **Control de capas** flotante (toggles: **Colegios, Salud, Avenidas**; parques fijos). *(El "mapa de
  calor" existió y se ELIMINÓ por redundante con los pines — no lo reincorpores salvo pedido explícito.)*
- Capas de puntos: **Colegios** (badges azules) y **Salud** (badges teal), de OSM.
- Leyenda flotante (escala de habitabilidad + Parque/Colegio/Salud/En construcción).
- Ficha: galería de fotos, ❤️ favorito, badge de fuente, precio serif + soles + $/m², **anillo de
  puntaje** + palabra, grid de stats, CTAs "Ver aviso"/WhatsApp, barras "¿Por qué este puntaje?".
- **Buscador** multi-distrito + calles/parques/avenidas (geocodificación Nominatim).

> Hubo una versión previa **verde** (Inter, badge %); respaldada pero NO es la actual.

## 4. Esquema de datos REAL por propiedad
```
id, address, lat, lng, source ("urbania" | "developer_site"=proyecto en construcción),
price_usd, price_pen, area_total_m2, bedrooms, url, publisher_whatsapp, project_status,
delivery_year, thumbs[] (fotos), description
_score: composite(0-1), ppm_usd, age_label, building_floors_est, llm_unit_floor,
        park_name/park_dist_m, stroad_nearest_name/dist/severity, metro_name/metro_dist_m,
        + los SUB-SCORES 0-1 (ver §5)
```
**Geometría OSM (`map_geo.json`):** `parks[]` (polígonos), `schools[]` y `health[]` (puntos lat/lng),
`stroads[]` (líneas + severidad). Generado por `osm/build_map_geo.py` (recortado a la bbox de PL-Lima).

## 5. Motor de puntaje REAL — sub-scores 0–1
`stroad`(calle tranquila) · `commerce`(comercio a pie) · `conn`(transporte/conectividad) ·
`park`(parque) · `health`(salud) · `school`(colegios) · `modernity`(la casa) · `cross`(caminable) ·
`bus`(transporte) · `value`(precio/m²). Puntaje = Σ(sub·peso)/Σpeso, **en vivo** en el navegador.
- **`school`** se calcula en el cliente desde `map_geo.json.schools` (distancia al colegio más cercano
  → 0..1). El resto sale de `rank.py`/OSM.
- **Perfiles** (default *Familia con niños*): Tranquilidad/vivir · Familia con niños · Inversión/reventa ·
  Personalizado (5 sliders: Tranquilidad→stroad, Parques→park, Comercio→commerce, Transporte→conn,
  Precio→value).
- "¿Por qué este puntaje?" muestra 5 barras: Calle tranquila, Comercio a pie, Parque cerca, **Colegios
  cerca**, Salud (y/o Transporte).

## 6. ⚠️ Brechas de datos (diséñalo con esto en mente)
**YA SON REALES (de OSM):** parques, avenidas, **colegios**, **salud**.
**AÚN sin fuente (no los muestres como dato real; márcalos "próximamente"):** seguridad, servicios
(agua/luz), clubs, malls, ciclovías, commute real al trabajo, riesgo sísmico/suelo.

## 7. Estado
- ✅ Hecho: mapa + puntaje por prioridades en vivo; rediseño "Cálida" (escritorio/ficha/móvil); 68
  propiedades reales; capas OSM de **parques + avenidas + colegios + salud**; **sub-score de colegios**;
  control de capas; pestañas + lista de resultados; buscador multi-distrito; etiquetas sobre el verde.
  Publicado en GitHub + **URL en vivo** (GitHub Pages).
- ⏳ Pendiente/ideas: cargar más distritos (multi-distrito real), más proyectos en preventa/construcción,
  y traer datos del backlog NO-OSM (seguridad, servicios, etc.). Opcional: mover `school_score` a `rank.py`.

## 8. Cómo entregar diseño para que encaje
1. Usa los **tokens y clases** de §3 (o propón cambios explícitos sobre ellos).
2. Muestra solo **campos/datos que existen** (§4–§6) o marca lo que falta como "próximamente".
3. Entrega como **CSS + HTML/vanilla JS** o descripción precisa (sin React/bundlers en el entregable final).
4. Si tocas el puntaje, son **sub-scores 0–1** ponderados por perfil (§5).
5. Indica responsivo (breakpoint 820px) y estados (hover, seleccionado, vacío).
6. Revisa la **URL en vivo** antes de proponer, para no repetir lo ya hecho.
