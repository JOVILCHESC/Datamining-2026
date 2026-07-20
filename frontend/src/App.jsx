import { useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';

const DISTRICT_CENTERS = {
  'Distrito ChangPing': { latitud: 40.097837, longitud: 116.361701 },
  'Distrito ChaoYang': { latitud: 39.950467, longitud: 116.48914 },
  'Distrito DaXing': { latitud: 39.796616, longitud: 116.505025 },
  'Distrito DongCheng': { latitud: 39.919318, longitud: 116.429445 },
  'Distrito FaXing': { latitud: 39.773348, longitud: 116.374449 },
  'Distrito FangShang': { latitud: 39.756582, longitud: 116.17851 },
  'Distrito FengTai': { latitud: 39.859435, longitud: 116.360017 },
  'Distrito HaiDian': { latitud: 39.989878, longitud: 116.328122 },
  'Distrito MenTouGou': { latitud: 40.117482, longitud: 116.637676 },
  'Distrito ShiJingShan': { latitud: 39.917787, longitud: 116.211556 },
  'Distrito ShunYi': { latitud: 39.935965, longitud: 116.119579 },
  'Distrito TongZhou': { latitud: 39.898365, longitud: 116.663567 },
  'Distrito XiCheng': { latitud: 39.914378, longitud: 116.363185 },
};

const DISTRICTS = Object.keys(DISTRICT_CENTERS);
const BUILDING_TYPES = ['Bungalow', 'Combinado', 'Placa', 'Torre'];
const RENOVATION_TYPES = ['Fina', 'Otro', 'Simple', 'Sin renovar'];
const STRUCTURES = ['Concreto', 'Ladrillo/Concreto', 'Ladrillo/Madera', 'Mixto', 'Steel'];
const FLOOR_LEVELS = ['Alto', 'Bajo', 'Medio'];

const INITIAL_DISTRICT = 'Distrito DongCheng';

const INITIAL_FORM = {
  nombre_distrito: INITIAL_DISTRICT,
  latitud: String(DISTRICT_CENTERS[INITIAL_DISTRICT].latitud),
  longitud: String(DISTRICT_CENTERS[INITIAL_DISTRICT].longitud),
  superficie_total: '68.19',
  cocina: '1',
  dormitorios: '1',
  sala_estar: '0',
  banios: '1',
  numero_pisos: '23',
  anio_construccion: '2009',
  metro: '1',
  ascensor: '1',
  propiedad_cinco_anios: '0',
  tipo_edificio: 'Torre',
  estado_renovacion: 'Otro',
  estructura: 'Concreto',
  nivel_piso: 'Medio',
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function toNumberMaybe(value) {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'No disponible';
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric);
}

function classifyPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Sin clasificación';
  if (numeric < 30000) return 'Rango bajo';
  if (numeric <= 50000) return 'Rango medio';
  return 'Rango alto';
}

function interpretPrice(value) {
  const bucket = classifyPrice(value);
  if (bucket === 'Rango bajo') {
    return 'La propiedad cae en un segmento de precio moderado o bajo para el mercado analizado, posiblemente por ubicación, tipología o antigüedad.';
  }
  if (bucket === 'Rango medio') {
    return 'La propiedad presenta un valor intermedio, coherente con características estándar de ubicación y superficie.';
  }
  if (bucket === 'Rango alto') {
    return 'La propiedad se proyecta en un rango alto, normalmente asociado a mejor ubicación, menor antigüedad o mejores atributos físicos.';
  }
  return 'No fue posible generar una interpretación automática.';
}

function findNearestDistrict(latitud, longitud) {
  const lat = Number(latitud);
  const lng = Number(longitud);
  let nearest = INITIAL_DISTRICT;
  let minDistance = Infinity;

  for (const [district, coords] of Object.entries(DISTRICT_CENTERS)) {
    const distance = Math.hypot(lat - coords.latitud, lng - coords.longitud);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = district;
    }
  }

  return nearest;
}

function MapSync({ center }) {
  const map = useMap();
  map.setView(center, map.getZoom(), { animate: true });
  return null;
}

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      const { lat, lng } = event.latlng;
      onSelect(lat, lng, findNearestDistrict(lat, lng));
    },
  });

  return null;
}

export default function App() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [resultado, setResultado] = useState(null);
  const [rotacion, setRotacion] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const center = useMemo(() => [Number(form.latitud), Number(form.longitud)], [form.latitud, form.longitud]);

  const payload = useMemo(() => ({
    longitud: toNumberMaybe(form.longitud),
    latitud: toNumberMaybe(form.latitud),
    superficie_total: toNumberMaybe(form.superficie_total),
    cocina: toNumberMaybe(form.cocina),
    dormitorios: toNumberMaybe(form.dormitorios),
    sala_estar: toNumberMaybe(form.sala_estar),
    banios: toNumberMaybe(form.banios),
    numero_pisos: toNumberMaybe(form.numero_pisos),
    anio_construccion: toNumberMaybe(form.anio_construccion),
    metro: toNumberMaybe(form.metro),
    ascensor: toNumberMaybe(form.ascensor),
    propiedad_cinco_anios: toNumberMaybe(form.propiedad_cinco_anios),
    tipo_edificio: form.tipo_edificio,
    estado_renovacion: form.estado_renovacion,
    estructura: form.estructura,
    nombre_distrito: form.nombre_distrito,
    nivel_piso: form.nivel_piso,
  }), [form]);

  function updateField(key, value) {
    setForm((current) => {
      if (key === 'nombre_distrito') {
        const coords = DISTRICT_CENTERS[value] ?? DISTRICT_CENTERS[INITIAL_DISTRICT];
        return {
          ...current,
          nombre_distrito: value,
          latitud: String(coords.latitud),
          longitud: String(coords.longitud),
        };
      }

      return { ...current, [key]: value };
    });
  }

  function handleMapSelect(lat, lng, districtGuess) {
    setForm((current) => ({
      ...current,
      latitud: lat.toFixed(6),
      longitud: lng.toFixed(6),
      nombre_distrito: districtGuess,
    }));
  }

  function resetForm() {
    setForm(INITIAL_FORM);
    setResultado(null);
    setRotacion(null);
    setError('');
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setResultado(null);
    setRotacion(null);
    setCargando(true);

    const hasMissing = Object.entries(payload).some(([_, value]) => {
      if (typeof value === 'string') return value.trim() === '';
      return value === undefined || Number.isNaN(value);
    });

    if (hasMissing) {
      setError('Completa todos los campos antes de predecir.');
      setCargando(false);
      return;
    }

    try {
      // Llamada 1: Predicción de precio
      const priceResponse = await fetch(`${API_BASE}/predict/individual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const priceData = await priceResponse.json().catch(() => ({}));

      if (!priceResponse.ok) {
        setError(priceData?.detail ? String(priceData.detail) : 'Error al generar la predicción de precio.');
        setCargando(false);
        return;
      }

      setResultado(priceData);

      // Llamada 2: Predicción de rotación
      const rotationResponse = await fetch(`${API_BASE}/predict/rotation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const rotationData = await rotationResponse.json().catch(() => ({}));

      if (!rotationResponse.ok) {
        console.warn('Advertencia: no se pudo obtener la predicción de rotación');
      } else {
        setRotacion(rotationData);
      }
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setCargando(false);
    }
  }

  const predictedPrice = resultado?.precio_unitario_m2_predicho ?? null;

  return (
    <div className="app-shell">
      <section className="hero">
        <div className="hero-card">
          <span className="eyebrow">Random Forest Regression · Beijing</span>
          <h1>Predicción inmobiliaria con entrada visual de ubicación.</h1>
          <p>
            El usuario no necesita escribir latitud y longitud a mano. Puede elegir un distrito o hacer clic en el mapa,
            y el sistema rellena las coordenadas por detrás para alimentar el pipeline entrenado.
          </p>

          <div className="hero-stats">
            <div className="stat">
              <strong>Variable objetivo</strong>
              <span>precio_unitario_m2</span>
            </div>
            <div className="stat">
              <strong>Ubicación</strong>
              <span>Mapa + distrito</span>
            </div>
            <div className="stat">
              <strong>Entrada segura</strong>
              <span>Sin fuga de datos</span>
            </div>
          </div>
        </div>

        <aside className="preview-card">
          <div>
            <span className="eyebrow" style={{ background: 'rgba(255,255,255,0.18)' }}>Guía rápida</span>
            <h2 style={{ margin: '14px 0 8px', fontSize: '1.7rem' }}>Cómo se usa</h2>
            <p>
              1. Selecciona el distrito o haz clic en el mapa.
              <br />2. Ajusta las características físicas de la propiedad.
              <br />3. Presiona predecir y revisa el valor estimado.
            </p>
          </div>

          <div>
            <div className="legend">
              <span>latitud/longitud automáticas</span>
              <span>One Hot Encoding</span>
              <span>Pipeline único</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="layout">
        <div className="panel glass-card">
          <div className="section-title">
            <div>
              <h2>Ubicación</h2>
              <p>El mapa determina el punto exacto y el distrito se sincroniza automáticamente.</p>
            </div>
            <button type="button" className="btn secondary" onClick={resetForm}>Reiniciar</button>
          </div>

          <div className="controls">
            <div className="form-grid">
              <div className="field full">
                <label>Distrito</label>
                <select value={form.nombre_distrito} onChange={(e) => updateField('nombre_distrito', e.target.value)}>
                  {DISTRICTS.map((district) => (
                    <option key={district} value={district}>{district}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Latitud</label>
                <input value={form.latitud} readOnly />
              </div>

              <div className="field">
                <label>Longitud</label>
                <input value={form.longitud} readOnly />
              </div>
            </div>

            <div className="map-shell">
              <div className="map-hud">
                <div className="map-hud-card">
                  <h3>Mapa de Beijing</h3>
                  <p>Haz clic sobre el punto que más se parezca a la ubicación real o usa el distrito como atajo.</p>
                </div>
                <div className="chip dark" style={{ alignSelf: 'flex-start' }}>
                  {form.latitud}, {form.longitud}
                </div>
              </div>

              <div className="map-center-dot" aria-hidden="true" />

              <MapContainer center={center} zoom={12} scrollWheelZoom>
                <MapSync center={center} />
                <MapClickHandler onSelect={handleMapSelect} />
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <CircleMarker center={center} radius={10} pathOptions={{ color: '#1d4ed8', fillColor: '#1d4ed8', fillOpacity: 0.75 }} />
              </MapContainer>

              <div className="map-note">
                Si seleccionas otro distrito, las coordenadas se rellenan automáticamente con el centro estimado de esa zona.
              </div>
            </div>

            <div className="map-toolbar">
              <span className="chip dark">Distrito detectado: {form.nombre_distrito}</span>
              <span className="chip">Centro del distrito aplicado automáticamente</span>
            </div>
          </div>
        </div>

        <div className="panel glass-card">
          <div className="section-title">
            <div>
              <h2>Características de la propiedad</h2>
              <p>Usa solo las variables válidas para el modelo. No se incluye el precio objetivo ni campos derivados.</p>
            </div>
          </div>

          <form className="controls" onSubmit={onSubmit}>
            <div className="form-grid">
              {[
                ['superficie_total', 'Superficie total (m²)'],
                ['cocina', 'Cocina'],
                ['dormitorios', 'Dormitorios'],
                ['sala_estar', 'Sala de estar'],
                ['banios', 'Baños'],
                ['numero_pisos', 'Número de pisos'],
                ['anio_construccion', 'Año construcción'],
              ].map(([key, label]) => (
                <div className="field" key={key}>
                  <label>{label}</label>
                  <input
                    type="number"
                    step="any"
                    value={form[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    required
                  />
                </div>
              ))}

              {[
                ['metro', 'Metro cercano'],
                ['ascensor', 'Ascensor'],
                ['propiedad_cinco_anios', 'Propiedad cinco años'],
              ].map(([key, label]) => (
                <div className="field" key={key}>
                  <label>{label}</label>
                  <select value={form[key]} onChange={(e) => updateField(key, e.target.value)}>
                    <option value="1">Sí</option>
                    <option value="0">No</option>
                  </select>
                </div>
              ))}

              <div className="field">
                <label>Tipo de edificio</label>
                <select value={form.tipo_edificio} onChange={(e) => updateField('tipo_edificio', e.target.value)}>
                  {BUILDING_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Estado de renovación</label>
                <select value={form.estado_renovacion} onChange={(e) => updateField('estado_renovacion', e.target.value)}>
                  {RENOVATION_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Estructura</label>
                <select value={form.estructura} onChange={(e) => updateField('estructura', e.target.value)}>
                  {STRUCTURES.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Nivel de piso</label>
                <select value={form.nivel_piso} onChange={(e) => updateField('nivel_piso', e.target.value)}>
                  {FLOOR_LEVELS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>

              <div className="field full">
                <label>Vista rápida del payload</label>
                <div className="summary-box" style={{ fontSize: 12, lineHeight: 1.5, overflowX: 'auto' }}>
                  {JSON.stringify(payload, null, 2)}
                </div>
              </div>
            </div>

            <div className="legend">
              <span>Contexto temporal actual aplicado por el backend</span>
              <span>Año / mes / trimestre se calculan con la fecha de hoy</span>
            </div>

            <div className="actions">
              <button type="submit" className="btn primary" disabled={cargando}>
                {cargando ? 'Prediciendo...' : 'Predecir precio unitario'}
              </button>
              <span className="chip">Se excluyen variables con fuga de información</span>
            </div>
          </form>

          {error && <div className="message error">{error}</div>}

          {resultado && (
            <div className="result-grid">
              <div className="message success">
                <strong>✓ Tasación de Precio</strong>
                <div className="result-price">¥ {formatMoney(predictedPrice)}</div>
                <div>por metro cuadrado</div>
                <div style={{ marginTop: 10, fontWeight: 700 }}>{classifyPrice(predictedPrice)}</div>
                <div style={{ marginTop: 10 }}>{interpretPrice(predictedPrice)}</div>
              </div>

              {rotacion && (
                <div className="message success" style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1))' }}>
                  <strong>✓ Predicción de Rotación</strong>
                  <div style={{ fontSize: '1.4rem', marginTop: 10, fontWeight: 700, color: rotacion.clasificacion.includes('Rápida') ? '#22c55e' : '#f97316' }}>
                    {rotacion.clasificacion}
                  </div>
                  <div style={{ marginTop: 10, fontSize: '0.9rem' }}>
                    <div>Confianza: {rotacion.confianza_prediccion}%</div>
                    <div style={{ marginTop: 5, opacity: 0.8 }}>
                      P(Rápida): {(rotacion.probabilidad_rapida * 100).toFixed(1)}% | P(Lenta): {(rotacion.probabilidad_lenta * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              )}

              <div className="feature-list">
                <div>
                  <small>Modelo Precio</small>
                  <strong>{resultado.modelo}</strong>
                </div>
                <div>
                  <small>Modelo Rotación</small>
                  <strong>{rotacion?.modelo ?? 'No disponible'}</strong>
                </div>
                <div>
                  <small>Distrito</small>
                  <strong>{form.nombre_distrito}</strong>
                </div>
                <div>
                  <small>Coordenadas</small>
                  <strong>{Number(form.latitud).toFixed(6)}, {Number(form.longitud).toFixed(6)}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}