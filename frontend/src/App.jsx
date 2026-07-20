import { useMemo, useRef, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import TemporalView from './TemporalView';


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
const STRUCTURES = [
  'Concreto',
  'Ladrillo/Concreto',
  'Ladrillo/Madera',
  'Mixto',
  'Steel',
];
const FLOOR_LEVELS = ['Alto', 'Bajo', 'Medio'];

const INITIAL_DISTRICT = 'Distrito DongCheng';
const CURRENT_YEAR = new Date().getFullYear();

const INITIAL_FORM = {
  nombre_distrito: INITIAL_DISTRICT,
  latitud: String(DISTRICT_CENTERS[INITIAL_DISTRICT].latitud),
  longitud: String(DISTRICT_CENTERS[INITIAL_DISTRICT].longitud),
  superficie_total: '68.19',
  cocina: '1',
  dormitorios: '1',
  sala_estar: '0',
  banios: '1',
  anio_construccion: '2009',
  metro: '1',
  ascensor: '1',
  propiedad_cinco_anios: '0',
  tipo_edificio: 'Torre',
  estado_renovacion: 'Otro',
  estructura: 'Concreto',
  nivel_piso: 'Medio',
};

const EXAMPLE_SLOW = {
  nombre_distrito: 'Distrito MenTouGou',
  latitud: String(DISTRICT_CENTERS['Distrito MenTouGou'].latitud),
  longitud: String(DISTRICT_CENTERS['Distrito MenTouGou'].longitud),
  superficie_total: '150',
  cocina: '1',
  dormitorios: '4',
  sala_estar: '2',
  banios: '2',
  numero_pisos: '3',
  anio_construccion: '1970',
  metro: '0',
  ascensor: '0',
  propiedad_cinco_anios: '0',
  tipo_edificio: 'Bungalow',
  estado_renovacion: 'Sin renovar',
  estructura: 'Ladrillo/Madera',
  nivel_piso: 'Bajo',
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';


function toNumberMaybe(value) {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}


function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}


function formatMoney(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 'No disponible';
  }

  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}


function formatPercentFromProbability(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return '0,0%';
  }

  return `${new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(numeric * 100)}%`;
}


function classifyPrice(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 'Sin clasificación';
  }

  if (numeric < 30000) {
    return 'Rango bajo';
  }

  if (numeric <= 50000) {
    return 'Rango medio';
  }

  return 'Rango alto';
}


function interpretPrice(value) {
  const bucket = classifyPrice(value);

  if (bucket === 'Rango bajo') {
    return (
      'El valor estimado se encuentra en el segmento bajo del mercado ' +
      'analizado. La ubicación, antigüedad o condición física pueden influir.'
    );
  }

  if (bucket === 'Rango medio') {
    return (
      'El valor estimado se encuentra en un rango intermedio, coherente ' +
      'con características habituales de ubicación y superficie.'
    );
  }

  if (bucket === 'Rango alto') {
    return (
      'El valor estimado se encuentra en el segmento alto del mercado, ' +
      'normalmente asociado a ubicación, menor antigüedad o mejores atributos.'
    );
  }

  return 'No fue posible generar una interpretación automática.';
}


function confidenceMeta(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return {
      label: 'No disponible',
      className: 'confidence-low',
      text: 'No fue posible evaluar la seguridad de esta predicción.',
    };
  }

  if (numeric >= 80) {
    return {
      label: 'Confianza alta',
      className: 'confidence-high',
      text: 'La diferencia entre ambas clases es amplia.',
    };
  }

  if (numeric >= 65) {
    return {
      label: 'Confianza moderada',
      className: 'confidence-medium',
      text: 'La predicción es útil, aunque conviene interpretarla con contexto.',
    };
  }

  return {
    label: 'Confianza baja',
    className: 'confidence-low',
    text: 'Las probabilidades están cercanas; el resultado debe tomarse con cautela.',
  };
}


function findNearestDistrict(latitud, longitud) {
  const lat = Number(latitud);
  const lng = Number(longitud);

  let nearest = INITIAL_DISTRICT;
  let minDistance = Infinity;

  for (const [district, coords] of Object.entries(DISTRICT_CENTERS)) {
    const distance = Math.hypot(
      lat - coords.latitud,
      lng - coords.longitud,
    );

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
      onSelect(
        lat,
        lng,
        findNearestDistrict(lat, lng),
      );
    },
  });

  return null;
}


function FieldHint({ children }) {
  return <span className="field-hint">{children}</span>;
}


function ResultPlaceholder() {
  return (
    <div className="result-placeholder">
      <div className="placeholder-icon">⌁</div>
      <h3>Resultado de la evaluación</h3>
      <p>
        Completa las características de la propiedad y presiona
        <strong> Evaluar propiedad</strong>.
      </p>
      <div className="pipeline-preview">
        <span>Datos del inmueble</span>
        <b>→</b>
        <span>Precio estimado</span>
        <b>→</b>
        <span>Rotación esperada</span>
      </div>
    </div>
  );
}


export default function App() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [resultado, setResultado] = useState(null);
  const [rotacion, setRotacion] = useState(null);
  const [error, setError] = useState('');
  const [advertencia, setAdvertencia] = useState('');
  const [cargando, setCargando] = useState(false);
  const [fase, setFase] = useState('');

  const resultRef = useRef(null);

  const center = useMemo(
    () => [
      Number(form.latitud),
      Number(form.longitud),
    ],
    [form.latitud, form.longitud],
  );

  const payload = useMemo(
    () => ({
      longitud: toNumberMaybe(form.longitud),
      latitud: toNumberMaybe(form.latitud),
      superficie_total: toNumberMaybe(form.superficie_total),
      cocina: toNumberMaybe(form.cocina),
      dormitorios: toNumberMaybe(form.dormitorios),
      sala_estar: toNumberMaybe(form.sala_estar),
      banios: toNumberMaybe(form.banios),
      anio_construccion: toNumberMaybe(form.anio_construccion),
      metro: toNumberMaybe(form.metro),
      ascensor: toNumberMaybe(form.ascensor),
      propiedad_cinco_anios: toNumberMaybe(
        form.propiedad_cinco_anios,
      ),
      tipo_edificio: form.tipo_edificio,
      estado_renovacion: form.estado_renovacion,
      estructura: form.estructura,
      nombre_distrito: form.nombre_distrito,
      nivel_piso: form.nivel_piso,
    }),
    [form],
  );

  const predictedPrice =
    resultado?.precio_unitario_m2_predicho ?? null;

  const isSlow =
    rotacion?.clasificacion?.toLowerCase().includes('lenta') ?? false;

  const confidence = Number(
    rotacion?.confianza_prediccion ?? 0,
  );

  const confidenceInfo = confidenceMeta(confidence);

  const fastProbability = clamp(
    Number(rotacion?.probabilidad_rapida ?? 0),
    0,
    1,
  );

  const slowProbability = clamp(
    Number(rotacion?.probabilidad_lenta ?? 0),
    0,
    1,
  );

  const evaluatedPriceUsed =
    rotacion?.precio_unitario_m2_utilizado ?? predictedPrice;

  function updateField(key, value) {
    setResultado(null);
    setRotacion(null);
    setError('');
    setAdvertencia('');

    setForm((current) => {
      if (key === 'nombre_distrito') {
        const coords =
          DISTRICT_CENTERS[value] ??
          DISTRICT_CENTERS[INITIAL_DISTRICT];

        return {
          ...current,
          nombre_distrito: value,
          latitud: String(coords.latitud),
          longitud: String(coords.longitud),
        };
      }

      return {
        ...current,
        [key]: value,
      };
    });
  }

  function handleMapSelect(lat, lng, districtGuess) {
    setResultado(null);
    setRotacion(null);
    setError('');
    setAdvertencia('');

    setForm((current) => ({
      ...current,
      latitud: lat.toFixed(6),
      longitud: lng.toFixed(6),
      nombre_distrito: districtGuess,
    }));
  }

  function applyExample(example) {
    setForm(example);
    setResultado(null);
    setRotacion(null);
    setError('');
    setAdvertencia('');
  }

  function resetForm() {
    applyExample(INITIAL_FORM);
  }

  function validatePayload() {
    const hasMissing = Object.values(payload).some((value) => {
      if (typeof value === 'string') {
        return value.trim() === '';
      }

      return value === undefined || Number.isNaN(value);
    });

    if (hasMissing) {
      return 'Completa todos los campos antes de evaluar la propiedad.';
    }

    if (payload.superficie_total <= 0) {
      return 'La superficie total debe ser mayor que cero.';
    }

    if (
      payload.anio_construccion < 1800 ||
      payload.anio_construccion > CURRENT_YEAR
    ) {
      return (
        `El año de construcción debe estar entre 1800 y ${CURRENT_YEAR}.`
      );
    }

    

    return '';
  }

  async function onSubmit(event) {
    event.preventDefault();

    const validationError = validatePayload();

    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setAdvertencia('');
    setResultado(null);
    setRotacion(null);
    setCargando(true);

    try {
      setFase('Estimando precio por metro cuadrado…');

      const priceResponse = await fetch(
        `${API_BASE}/predict/individual`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const priceData = await priceResponse
        .json()
        .catch(() => ({}));

      if (!priceResponse.ok) {
        throw new Error(
          priceData?.detail
            ? String(priceData.detail)
            : 'No fue posible estimar el precio.',
        );
      }

      setResultado(priceData);
      setFase('Calculando probabilidad de rotación…');

      const rotationResponse = await fetch(
        `${API_BASE}/predict/rotation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const rotationData = await rotationResponse
        .json()
        .catch(() => ({}));

      if (!rotationResponse.ok) {
        setAdvertencia(
          rotationData?.detail
            ? `El precio fue calculado, pero la rotación falló: ${rotationData.detail}`
            : 'El precio fue calculado, pero no fue posible obtener la rotación.',
        );
      } else {
        setRotacion(rotationData);
      }

      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    } catch (err) {
      setError(
        String(
          err?.message ??
          'No fue posible comunicarse con el backend.',
        ),
      );
    } finally {
      setFase('');
      setCargando(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">BJ</span>
          <div>
            <strong>Beijing Property Intelligence</strong>
            <small>Evaluación predictiva de propiedades</small>
          </div>
        </div>

        <div className="topbar-actions">
          <nav className="topbar-nav" aria-label="Vistas del sistema">
            <a href="#property-evaluation">Evaluación individual</a>
            <a href="#market-forecast">Pronóstico temporal</a>
          </nav>

          <div className="topbar-status">
            <span className="status-dot" />
            Sistema listo
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-card">
          <span className="eyebrow">
            Random Forest · Precio + Rotación
          </span>

          <h1>
            Evalúa una propiedad antes de incorporarla al portafolio.
          </h1>

          <p>
            Selecciona la ubicación y completa las características
            físicas. El sistema estima primero el precio por metro
            cuadrado y luego utiliza ese valor para calcular la
            rotación esperada.
          </p>

          <div className="model-flow" aria-label="Flujo de modelos">
            <div className="flow-step">
              <span>1</span>
              <div>
                <strong>Datos del inmueble</strong>
                <small>Ubicación y características</small>
              </div>
            </div>

            <div className="flow-arrow">→</div>

            <div className="flow-step">
              <span>2</span>
              <div>
                <strong>Tasación</strong>
                <small>Precio unitario estimado</small>
              </div>
            </div>

            <div className="flow-arrow">→</div>

            <div className="flow-step">
              <span>3</span>
              <div>
                <strong>Rotación</strong>
                <small>Rápida o lenta</small>
              </div>
            </div>
          </div>
        </div>

        <aside className="preview-card">
          <div>
            <span className="eyebrow eyebrow-light">
              Guía rápida
            </span>

            <h2>Cómo usar la herramienta</h2>

            <ol className="quick-guide">
              <li>
                Selecciona el distrito o marca una ubicación
                en el mapa.
              </li>
              <li>
                Completa las características reales de la
                propiedad.
              </li>
              <li>
                Presiona <strong>Evaluar propiedad</strong>.
              </li>
            </ol>
          </div>

          <div className="privacy-note">
            <strong>Entrada segura</strong>
            <span>
              No se solicitan DEM, precio real de venta ni
              variables posteriores a la operación.
            </span>
          </div>
        </aside>
      </section>

      <main className="layout" id="property-evaluation">
        <section className="panel glass-card location-panel">
          <div className="section-title">
            <div>
              <span className="section-kicker">Paso 1</span>
              <h2>Ubicación de la propiedad</h2>
              <p>
                Elige un distrito o selecciona un punto en el
                mapa. Las coordenadas se completan automáticamente.
              </p>
            </div>

            <button
              type="button"
              className="btn secondary"
              onClick={resetForm}
              disabled={cargando}
            >
              Reiniciar
            </button>
          </div>

          <div className="controls">
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="nombre_distrito">
                  Distrito
                </label>
                <select
                  id="nombre_distrito"
                  value={form.nombre_distrito}
                  onChange={(event) =>
                    updateField(
                      'nombre_distrito',
                      event.target.value,
                    )
                  }
                >
                  {DISTRICTS.map((district) => (
                    <option
                      key={district}
                      value={district}
                    >
                      {district}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="latitud">Latitud</label>
                <input
                  id="latitud"
                  value={form.latitud}
                  readOnly
                />
                <FieldHint>
                  Se completa desde el mapa.
                </FieldHint>
              </div>

              <div className="field">
                <label htmlFor="longitud">Longitud</label>
                <input
                  id="longitud"
                  value={form.longitud}
                  readOnly
                />
                <FieldHint>
                  Se completa desde el mapa.
                </FieldHint>
              </div>
            </div>

            <div className="map-shell">
              <div className="map-hud">
                <div className="map-hud-card">
                  <h3>Mapa de Beijing</h3>
                  <p>
                    Haz clic sobre la ubicación aproximada de
                    la propiedad.
                  </p>
                </div>

                <div className="chip dark">
                  {form.latitud}, {form.longitud}
                </div>
              </div>

              <MapContainer
                center={center}
                zoom={12}
                scrollWheelZoom
              >
                <MapSync center={center} />
                <MapClickHandler
                  onSelect={handleMapSelect}
                />
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <CircleMarker
                  center={center}
                  radius={10}
                  pathOptions={{
                    color: '#1d4ed8',
                    fillColor: '#2563eb',
                    fillOpacity: 0.82,
                  }}
                />
              </MapContainer>

              <div className="map-note">
                El distrito se aproxima automáticamente según
                el punto seleccionado.
              </div>
            </div>

            <div className="map-toolbar">
              <span className="chip dark">
                {form.nombre_distrito}
              </span>
              <span className="chip">
                Coordenadas sincronizadas
              </span>
            </div>
          </div>
        </section>

        <section className="panel glass-card form-panel">
          <div className="section-title compact">
            <div>
              <span className="section-kicker">Paso 2</span>
              <h2>Características del inmueble</h2>
              <p>
                Completa los datos conocidos antes de la venta.
              </p>
            </div>
          </div>

          <div className="example-actions">
            <span>Ejemplos rápidos:</span>
            <button
              type="button"
              className="example-button"
              onClick={() => applyExample(INITIAL_FORM)}
              disabled={cargando}
            >
              Caso estándar
            </button>
            <button
              type="button"
              className="example-button"
              onClick={() => applyExample(EXAMPLE_SLOW)}
              disabled={cargando}
            >
              Posible rotación lenta
            </button>
          </div>

          <form
            className="controls"
            onSubmit={onSubmit}
            noValidate
          >
            <div className="form-section">
              <div className="form-section-title">
                <span>Características físicas</span>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="superficie_total">
                    Superficie total
                  </label>
                  <div className="input-with-unit">
                    <input
                      id="superficie_total"
                      type="number"
                      min="1"
                      step="0.01"
                      value={form.superficie_total}
                      onChange={(event) =>
                        updateField(
                          'superficie_total',
                          event.target.value,
                        )
                      }
                      required
                    />
                    <span>m²</span>
                  </div>
                </div>

                {[
                  ['cocina', 'Cocina', 0],
                  ['dormitorios', 'Dormitorios', 0],
                  ['sala_estar', 'Sala de estar', 0],
                  ['banios', 'Baños', 0],
                ].map(([key, label, min]) => (
                  <div className="field" key={key}>
                    <label htmlFor={key}>{label}</label>
                    <input
                      id={key}
                      type="number"
                      min={min}
                      step="1"
                      value={form[key]}
                      onChange={(event) =>
                        updateField(
                          key,
                          event.target.value,
                        )
                      }
                      required
                    />
                  </div>
                ))}

                <div className="field">
                  <label htmlFor="anio_construccion">
                    Año de construcción
                  </label>
                  <input
                    id="anio_construccion"
                    type="number"
                    min="1800"
                    max={CURRENT_YEAR}
                    step="1"
                    value={form.anio_construccion}
                    onChange={(event) =>
                      updateField(
                        'anio_construccion',
                        event.target.value,
                      )
                    }
                    required
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title">
                <span>Condiciones y equipamiento</span>
              </div>

              <div className="form-grid">
                {[
                  ['metro', 'Metro cercano'],
                  ['ascensor', 'Ascensor'],
                  [
                    'propiedad_cinco_anios',
                    'Propiedad con cinco años o más',
                  ],
                ].map(([key, label]) => (
                  <div className="field" key={key}>
                    <label htmlFor={key}>{label}</label>
                    <select
                      id={key}
                      value={form[key]}
                      onChange={(event) =>
                        updateField(
                          key,
                          event.target.value,
                        )
                      }
                    >
                      <option value="1">Sí</option>
                      <option value="0">No</option>
                    </select>
                  </div>
                ))}

                <div className="field">
                  <label htmlFor="tipo_edificio">
                    Tipo de edificio
                  </label>
                  <select
                    id="tipo_edificio"
                    value={form.tipo_edificio}
                    onChange={(event) =>
                      updateField(
                        'tipo_edificio',
                        event.target.value,
                      )
                    }
                  >
                    {BUILDING_TYPES.map((option) => (
                      <option
                        key={option}
                        value={option}
                      >
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="estado_renovacion">
                    Estado de renovación
                  </label>
                  <select
                    id="estado_renovacion"
                    value={form.estado_renovacion}
                    onChange={(event) =>
                      updateField(
                        'estado_renovacion',
                        event.target.value,
                      )
                    }
                  >
                    {RENOVATION_TYPES.map((option) => (
                      <option
                        key={option}
                        value={option}
                      >
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="estructura">
                    Estructura
                  </label>
                  <select
                    id="estructura"
                    value={form.estructura}
                    onChange={(event) =>
                      updateField(
                        'estructura',
                        event.target.value,
                      )
                    }
                  >
                    {STRUCTURES.map((option) => (
                      <option
                        key={option}
                        value={option}
                      >
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="nivel_piso">
                    Nivel de piso
                  </label>
                  <select
                    id="nivel_piso"
                    value={form.nivel_piso}
                    onChange={(event) =>
                      updateField(
                        'nivel_piso',
                        event.target.value,
                      )
                    }
                  >
                    {FLOOR_LEVELS.map((option) => (
                      <option
                        key={option}
                        value={option}
                      >
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="evaluation-note">
              <div className="evaluation-note-icon">✓</div>
              <div>
                <strong>Evaluación encadenada</strong>
                <span>
                  El precio estimado por el primer modelo se
                  utiliza como entrada del modelo de rotación.
                </span>
              </div>
            </div>

            <div className="actions">
              <button
                type="submit"
                className="btn primary evaluate-button"
                disabled={cargando}
              >
                {cargando
                  ? fase || 'Evaluando…'
                  : 'Evaluar propiedad'}
              </button>

              <button
                type="button"
                className="btn secondary"
                onClick={resetForm}
                disabled={cargando}
              >
                Limpiar
              </button>
            </div>
          </form>

          {error && (
            <div
              className="message error"
              role="alert"
            >
              <strong>No fue posible evaluar la propiedad</strong>
              <span>{error}</span>
            </div>
          )}

          {advertencia && (
            <div
              className="message warning"
              role="status"
            >
              <strong>Evaluación parcial</strong>
              <span>{advertencia}</span>
            </div>
          )}
        </section>
      </main>

      <section
        className="results-section"
        ref={resultRef}
      >
        <div className="results-heading">
          <div>
            <span className="section-kicker">Paso 3</span>
            <h2>Resultado de la evaluación</h2>
            <p>
              La probabilidad mostrada corresponde a esta
              propiedad específica, no al rendimiento global
              del modelo.
            </p>
          </div>
        </div>

        {!resultado && <ResultPlaceholder />}

        {resultado && (
          <div className="results-grid">
            <article className="result-card price-card">
              <div className="result-card-header">
                <div>
                  <span className="result-label">
                    Tasación de precio
                  </span>
                  <h3>Precio unitario estimado</h3>
                </div>
                <span className="result-status success">
                  Completado
                </span>
              </div>

              <div className="result-price">
                <span>¥</span>
                {formatMoney(predictedPrice)}
              </div>

              <p className="result-unit">
                Yuan por metro cuadrado
              </p>

              <div className="price-band">
                {classifyPrice(predictedPrice)}
              </div>

              <p className="result-description">
                {interpretPrice(predictedPrice)}
              </p>

              <div className="model-detail">
                <span>Modelo utilizado</span>
                <strong>{resultado.modelo}</strong>
              </div>
            </article>

            <article
              className={[
                'result-card',
                'rotation-card',
                isSlow ? 'rotation-slow' : 'rotation-fast',
              ].join(' ')}
            >
              <div className="result-card-header">
                <div>
                  <span className="result-label">
                    Predicción de rotación
                  </span>
                  <h3>
                    {rotacion
                      ? rotacion.clasificacion
                      : 'No disponible'}
                  </h3>
                </div>

                {rotacion && (
                  <span
                    className={[
                      'result-status',
                      isSlow ? 'slow' : 'fast',
                    ].join(' ')}
                  >
                    {isSlow ? 'Lenta' : 'Rápida'}
                  </span>
                )}
              </div>

              {rotacion ? (
                <>
                  <div className="confidence-row">
                    <div>
                      <span>Probabilidad de la clase</span>
                      <strong>
                        {new Intl.NumberFormat('es-ES', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(confidence)}
                        %
                      </strong>
                    </div>

                    <span
                      className={[
                        'confidence-badge',
                        confidenceInfo.className,
                      ].join(' ')}
                    >
                      {confidenceInfo.label}
                    </span>
                  </div>

                  <p className="confidence-copy">
                    {confidenceInfo.text}
                  </p>

                  <div className="probability-block">
                    <div className="probability-header">
                      <span>Rápida</span>
                      <strong>
                        {formatPercentFromProbability(
                          fastProbability,
                        )}
                      </strong>
                    </div>
                    <div className="probability-track">
                      <div
                        className="probability-fill fast"
                        style={{
                          width: `${fastProbability * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="probability-block">
                    <div className="probability-header">
                      <span>Lenta</span>
                      <strong>
                        {formatPercentFromProbability(
                          slowProbability,
                        )}
                      </strong>
                    </div>
                    <div className="probability-track">
                      <div
                        className="probability-fill slow"
                        style={{
                          width: `${slowProbability * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="chain-detail">
                    <span>Precio enviado al clasificador</span>
                    <strong>
                      ¥ {formatMoney(evaluatedPriceUsed)} / m²
                    </strong>
                  </div>

                  {rotacion.umbral_lenta_aplicado !== undefined && (
                    <div className="threshold-note">
                      Umbral aplicado para clasificar como lenta:{' '}
                      <strong>
                        {formatPercentFromProbability(
                          rotacion.umbral_lenta_aplicado,
                        )}
                      </strong>
                    </div>
                  )}

                  <div className="model-detail">
                    <span>Modelo utilizado</span>
                    <strong>{rotacion.modelo}</strong>
                  </div>
                </>
              ) : (
                <div className="rotation-unavailable">
                  El precio fue estimado, pero no se obtuvo la
                  clasificación de rotación.
                </div>
              )}
            </article>

            <article className="result-card summary-card">
              <div className="result-card-header">
                <div>
                  <span className="result-label">
                    Resumen del inmueble
                  </span>
                  <h3>{form.nombre_distrito}</h3>
                </div>
              </div>

              <div className="summary-grid">
                <div>
                  <small>Superficie</small>
                  <strong>
                    {formatMoney(form.superficie_total)} m²
                  </strong>
                </div>

                <div>
                  <small>Construcción</small>
                  <strong>{form.anio_construccion}</strong>
                </div>

                <div>
                  <small>Tipo</small>
                  <strong>{form.tipo_edificio}</strong>
                </div>

                <div>
                  <small>Renovación</small>
                  <strong>{form.estado_renovacion}</strong>
                </div>

                <div>
                  <small>Metro</small>
                  <strong>
                    {form.metro === '1' ? 'Sí' : 'No'}
                  </strong>
                </div>

                <div>
                  <small>Ascensor</small>
                  <strong>
                    {form.ascensor === '1' ? 'Sí' : 'No'}
                  </strong>
                </div>
              </div>

              <div className="coordinates-box">
                <small>Coordenadas utilizadas</small>
                <strong>
                  {Number(form.latitud).toFixed(6)},{' '}
                  {Number(form.longitud).toFixed(6)}
                </strong>
              </div>
            </article>
          </div>
        )}
      </section>

      <TemporalView />

      <footer className="footer">
        <span>
          Proyecto de Data Mining · Mercado residencial de Beijing
        </span>
        <span>
          Random Forest Regressor + Random Forest Classifier + ThetaForecaster
        </span>
      </footer>
    </div>
  );
}
