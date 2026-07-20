import { useEffect, useMemo, useState } from 'react';
import './temporal.css';


const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const HORIZONS = [6, 12, 18, 24];


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


function formatMetric(value, suffix = '') {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 'No disponible';
  }

  return (
    new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric)
    + suffix
  );
}


function formatMonth(value) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-ES', {
    month: 'short',
    year: 'numeric',
  }).format(date);
}


function createPath(points) {
  return points
    .map((point, index) => (
      `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
    ))
    .join(' ');
}


function ForecastChart({ historical, forecast }) {
  const width = 1100;
  const height = 420;
  const padding = {
    top: 34,
    right: 28,
    bottom: 54,
    left: 86,
  };

  const chart = useMemo(() => {
    const historicalRows = (historical ?? []).map((row) => ({
      date: row.fecha_mes,
      actual: Number(row.precio_m2_real),
      forecast: null,
      lower: null,
      upper: null,
    }));

    const forecastRows = (forecast ?? []).map((row) => ({
      date: row.fecha_mes,
      actual: null,
      forecast: Number(row.precio_m2_predicho),
      lower: Number(row.limite_inferior),
      upper: Number(row.limite_superior),
    }));

    const rows = [...historicalRows, ...forecastRows];

    const values = [];

    rows.forEach((row) => {
      [row.actual, row.forecast, row.lower, row.upper].forEach(
        (value) => {
          if (Number.isFinite(value)) {
            values.push(value);
          }
        },
      );
    });

    if (rows.length < 2 || values.length === 0) {
      return null;
    }

    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);

    const extra = Math.max(
      (maxValue - minValue) * 0.12,
      500,
    );

    minValue -= extra;
    maxValue += extra;

    const innerWidth =
      width - padding.left - padding.right;

    const innerHeight =
      height - padding.top - padding.bottom;

    const xForIndex = (index) => (
      padding.left
      + (
        index
        / Math.max(rows.length - 1, 1)
      ) * innerWidth
    );

    const yForValue = (value) => (
      padding.top
      + (
        (maxValue - value)
        / Math.max(maxValue - minValue, 1)
      ) * innerHeight
    );

    const actualPoints = historicalRows.map((row, index) => ({
      x: xForIndex(index),
      y: yForValue(row.actual),
      value: row.actual,
      date: row.date,
    }));

    const forecastOffset = historicalRows.length;

    const forecastPoints = forecastRows.map((row, index) => ({
      x: xForIndex(forecastOffset + index),
      y: yForValue(row.forecast),
      value: row.forecast,
      date: row.date,
    }));

    const forecastLinePoints = [];

    if (actualPoints.length > 0) {
      forecastLinePoints.push(
        actualPoints[actualPoints.length - 1],
      );
    }

    forecastLinePoints.push(...forecastPoints);

    const upperPoints = forecastRows.map((row, index) => ({
      x: xForIndex(forecastOffset + index),
      y: yForValue(row.upper),
    }));

    const lowerPoints = forecastRows
      .map((row, index) => ({
        x: xForIndex(forecastOffset + index),
        y: yForValue(row.lower),
      }))
      .reverse();

    const intervalPoints = [
      ...upperPoints,
      ...lowerPoints,
    ];

    const yTicks = Array.from(
      { length: 5 },
      (_, index) => {
        const ratio = index / 4;
        const value = maxValue - ratio * (
          maxValue - minValue
        );

        return {
          value,
          y: padding.top + ratio * innerHeight,
        };
      },
    );

    const xTickIndexes = Array.from(
      new Set([
        0,
        Math.floor((rows.length - 1) * 0.25),
        Math.floor((rows.length - 1) * 0.5),
        Math.floor((rows.length - 1) * 0.75),
        rows.length - 1,
      ]),
    );

    const xTicks = xTickIndexes.map((index) => ({
      x: xForIndex(index),
      label: formatMonth(rows[index].date),
    }));

    const dividerX = (
      historicalRows.length > 0
      && forecastRows.length > 0
    )
      ? xForIndex(historicalRows.length - 0.5)
      : null;

    return {
      actualPoints,
      forecastPoints,
      forecastLinePoints,
      intervalPoints,
      yTicks,
      xTicks,
      dividerX,
      innerHeight,
    };
  }, [historical, forecast]);

  if (!chart) {
    return (
      <div className="temporal-chart-empty">
        No existen datos suficientes para construir el gráfico.
      </div>
    );
  }

  return (
    <div className="temporal-chart-scroll">
      <svg
        className="temporal-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Serie histórica y pronóstico mensual del precio por metro cuadrado"
      >
        <defs>
          <linearGradient
            id="forecastArea"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor="#2563eb"
              stopOpacity="0.22"
            />
            <stop
              offset="100%"
              stopColor="#2563eb"
              stopOpacity="0.03"
            />
          </linearGradient>
        </defs>

        {chart.yTicks.map((tick) => (
          <g key={tick.y}>
            <line
              x1="86"
              x2="1072"
              y1={tick.y}
              y2={tick.y}
              className="chart-grid-line"
            />
            <text
              x="74"
              y={tick.y + 4}
              textAnchor="end"
              className="chart-axis-label"
            >
              {new Intl.NumberFormat('es-ES', {
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(tick.value)}
            </text>
          </g>
        ))}

        {chart.xTicks.map((tick) => (
          <text
            key={`${tick.x}-${tick.label}`}
            x={tick.x}
            y="397"
            textAnchor="middle"
            className="chart-axis-label"
          >
            {tick.label}
          </text>
        ))}

        {chart.dividerX !== null && (
          <g>
            <line
              x1={chart.dividerX}
              x2={chart.dividerX}
              y1="34"
              y2={34 + chart.innerHeight}
              className="chart-divider"
            />
            <text
              x={chart.dividerX + 10}
              y="54"
              className="chart-divider-label"
            >
              Inicio del pronóstico
            </text>
          </g>
        )}

        {chart.intervalPoints.length > 2 && (
          <polygon
            points={chart.intervalPoints
              .map((point) => `${point.x},${point.y}`)
              .join(' ')}
            fill="url(#forecastArea)"
          />
        )}

        {chart.actualPoints.length > 1 && (
          <path
            d={createPath(chart.actualPoints)}
            className="chart-line actual"
          />
        )}

        {chart.forecastLinePoints.length > 1 && (
          <path
            d={createPath(chart.forecastLinePoints)}
            className="chart-line forecast"
          />
        )}

        {chart.actualPoints.map((point) => (
          <circle
            key={`actual-${point.date}`}
            cx={point.x}
            cy={point.y}
            r="3.2"
            className="chart-point actual"
          >
            <title>
              {formatMonth(point.date)}: ¥ {formatMoney(point.value)}
            </title>
          </circle>
        ))}

        {chart.forecastPoints.map((point) => (
          <circle
            key={`forecast-${point.date}`}
            cx={point.x}
            cy={point.y}
            r="4"
            className="chart-point forecast"
          >
            <title>
              {formatMonth(point.date)}: ¥ {formatMoney(point.value)}
            </title>
          </circle>
        ))}
      </svg>
    </div>
  );
}


export default function TemporalView() {
  const [horizon, setHorizon] = useState(12);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadForecast() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(
          `${API_BASE}/forecast/theta?steps=${horizon}&history_months=36`,
          {
            signal: controller.signal,
          },
        );

        const body = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            body?.detail
              ? String(body.detail)
              : 'No fue posible cargar el pronóstico temporal.',
          );
        }

        setData(body);
      } catch (requestError) {
        if (requestError?.name !== 'AbortError') {
          setError(
            String(
              requestError?.message
              ?? 'No fue posible conectar con el backend.',
            ),
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadForecast();

    return () => {
      controller.abort();
    };
  }, [horizon]);

  const historicalRows = useMemo(() => {
    const candidates = [
      data?.historico,
      data?.history,
      data?.historical,
      data?.serie_historica,
    ];

    return (
      candidates.find((candidate) => Array.isArray(candidate))
      ?? []
    );
  }, [data]);

  const forecastRows = useMemo(() => {
    const candidates = [
      data?.pronostico,
      data?.forecast,
      data?.pronóstico,
      data?.predicciones,
    ];

    return (
      candidates.find((candidate) => Array.isArray(candidate))
      ?? []
    );
  }, [data]);

  const fallbackSummary = useMemo(() => {
    const lastHistorical = historicalRows.at(-1);
    const firstForecast = forecastRows.at(0);
    const lastForecast = forecastRows.at(-1);

    const lastReal = Number(
      lastHistorical?.precio_m2_real
      ?? lastHistorical?.precio_unitario_m2
      ?? lastHistorical?.valor,
    );

    const firstPredicted = Number(
      firstForecast?.precio_m2_predicho
      ?? firstForecast?.precio_unitario_m2
      ?? firstForecast?.valor,
    );

    const lastPredicted = Number(
      lastForecast?.precio_m2_predicho
      ?? lastForecast?.precio_unitario_m2
      ?? lastForecast?.valor,
    );

    const forecastValues = forecastRows
      .map((row) => Number(
        row?.precio_m2_predicho
        ?? row?.precio_unitario_m2
        ?? row?.valor,
      ))
      .filter(Number.isFinite);

    const variationAbsolute = (
      Number.isFinite(lastReal)
      && Number.isFinite(lastPredicted)
    )
      ? lastPredicted - lastReal
      : null;

    const variationPct = (
      Number.isFinite(variationAbsolute)
      && Number.isFinite(lastReal)
      && lastReal !== 0
    )
      ? (variationAbsolute / lastReal) * 100
      : null;

    return {
      ultimo_precio_real: Number.isFinite(lastReal)
        ? lastReal
        : null,
      primer_precio_pronosticado: Number.isFinite(firstPredicted)
        ? firstPredicted
        : null,
      ultimo_precio_pronosticado: Number.isFinite(lastPredicted)
        ? lastPredicted
        : null,
      promedio_pronosticado: forecastValues.length
        ? (
          forecastValues.reduce((sum, value) => sum + value, 0)
          / forecastValues.length
        )
        : null,
      variacion_absoluta: variationAbsolute,
      variacion_pct: variationPct,
      tendencia: (
        variationAbsolute > 0
          ? 'Alcista'
          : (
            variationAbsolute < 0
              ? 'Bajista'
              : 'Estable'
          )
      ),
    };
  }, [historicalRows, forecastRows]);

  const summary = {
    ...fallbackSummary,
    ...(data?.resumen ?? {}),
  };

  const metrics = data?.metricas_backtest ?? {};
  const trend = summary?.tendencia ?? 'No disponible';
  const trendClass = trend === 'Alcista'
    ? 'trend-up'
    : (
      trend === 'Bajista'
        ? 'trend-down'
        : 'trend-flat'
    );

  return (
    <section
      className="temporal-section"
      id="market-forecast"
    >
      <div className="temporal-heading">
        <div>
          <span className="section-kicker">
            Perspectiva temporal
          </span>
          <h2>
            Pronóstico mensual del precio promedio por m²
          </h2>
          <p>
            ThetaForecaster analiza la serie histórica mensual
            y proyecta la evolución futura del mercado de Beijing.
          </p>
        </div>

        <div className="horizon-control">
          <label htmlFor="forecast-horizon">
            Horizonte
          </label>
          <select
            id="forecast-horizon"
            value={horizon}
            onChange={(event) =>
              setHorizon(Number(event.target.value))
            }
            disabled={loading}
          >
            {HORIZONS.map((months) => (
              <option
                key={months}
                value={months}
              >
                {months} meses
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="temporal-loading">
          <span className="temporal-spinner" />
          Generando pronóstico con ThetaForecaster…
        </div>
      )}

      {error && (
        <div className="temporal-error">
          <strong>
            No fue posible cargar la vista temporal
          </strong>
          <span>{error}</span>
          <small>
            Revisa que el backend esté activo y que exista
            models_pkl/modelo_theta_precio_m2_ajuste_estacional.pkl.
          </small>
        </div>
      )}

      {!loading && !error && data && forecastRows.length === 0 && (
        <div className="temporal-error">
          <strong>
            El backend respondió, pero no entregó el pronóstico
          </strong>
          <span>
            No se encontró una lista en las propiedades
            "pronostico" ni "forecast".
          </span>
          <small>
            Abre la pestaña Network del navegador y revisa la
            respuesta de /forecast/theta.
          </small>
        </div>
      )}

      {!loading && !error && data && forecastRows.length > 0 && (
        <>
          <div className="temporal-summary-grid">
            <article className="temporal-stat-card primary">
              <span>Último precio real</span>
              <strong>
                ¥ {formatMoney(summary.ultimo_precio_real)}
              </strong>
              <small>por metro cuadrado</small>
            </article>

            <article className="temporal-stat-card">
              <span>Último mes proyectado</span>
              <strong>
                ¥ {formatMoney(
                  summary.ultimo_precio_pronosticado,
                )}
              </strong>
              <small>
                Horizonte de {data.horizonte_meses ?? horizon} meses
              </small>
            </article>

            <article className="temporal-stat-card">
              <span>Tendencia proyectada</span>
              <strong className={trendClass}>
                {trend}
              </strong>
              <small>
                {formatMetric(
                  summary.variacion_pct,
                  '%',
                )}{' '}
                respecto al último valor real
              </small>
            </article>

            <article className="temporal-stat-card">
              <span>Promedio pronosticado</span>
              <strong>
                ¥ {formatMoney(
                  summary.promedio_pronosticado,
                )}
              </strong>
              <small>promedio del horizonte</small>
            </article>
          </div>

          <div className="temporal-content-grid">
            <article className="temporal-chart-card">
              <div className="temporal-card-header">
                <div>
                  <h3>Histórico y pronóstico</h3>
                  <p>
                    La franja representa el intervalo estimado
                    de incertidumbre.
                  </p>
                </div>

                <div className="chart-legend">
                  <span>
                    <i className="legend-line actual" />
                    Histórico
                  </span>
                  <span>
                    <i className="legend-line forecast" />
                    Pronóstico
                  </span>
                  <span>
                    <i className="legend-area" />
                    Intervalo
                  </span>
                </div>
              </div>

              <ForecastChart
                historical={historicalRows}
                forecast={forecastRows}
              />
            </article>

            <aside className="temporal-metrics-card">
              <div>
                <span className="temporal-card-kicker">
                  Rendimiento del backtest
                </span>
                <h3>Métricas del modelo</h3>
                <p>
                  Calculadas mediante evaluación temporal
                  walk-forward.
                </p>
              </div>

              <div className="metric-list">
                <div>
                  <span>MAE</span>
                  <strong>
                    {formatMetric(metrics.mae)}
                  </strong>
                  <small>Error absoluto medio</small>
                </div>

                <div>
                  <span>RMSE</span>
                  <strong>
                    {formatMetric(metrics.rmse)}
                  </strong>
                  <small>
                    Penaliza con mayor fuerza errores altos
                  </small>
                </div>

                <div>
                  <span>MAPE</span>
                  <strong>
                    {formatMetric(
                      metrics.mape_pct,
                      '%',
                    )}
                  </strong>
                  <small>Error porcentual medio</small>
                </div>
              </div>

              <div className="theta-config">
                <div>
                  <span>Modelo</span>
                  <strong>{data.modelo_temporal ?? data.modelo ?? 'ThetaForecaster'}</strong>
                </div>
                <div>
                  <span>Estacionalidad</span>
                  <strong>
                    {data.periodo_estacional ?? 12} meses
                  </strong>
                </div>
                <div>
                  <span>Ajuste estacional</span>
                  <strong>
                    {data.aplicar_ajuste_estacional
                      ? `Sí · intensidad ${data.intensidad_ajuste_estacional ?? 'No informada'}`
                      : 'No'}
                  </strong>
                </div>
                <div>
                  <span>Datos hasta</span>
                  <strong>
                    {formatMonth(
                      data.ultima_fecha_entrenamiento
                      ?? data.fecha_fin
                      ?? data.ultima_fecha,
                    )}
                  </strong>
                </div>
              </div>
            </aside>
          </div>

          <article className="forecast-table-card">
            <div className="temporal-card-header">
              <div>
                <h3>Detalle mensual del pronóstico</h3>
                <p>
                  Precio estimado e intervalo por cada mes futuro.
                </p>
              </div>
            </div>

            <div className="forecast-table-scroll">
              <table className="forecast-table">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th>Precio estimado</th>
                    <th>Límite inferior</th>
                    <th>Límite superior</th>
                    <th>Ajuste estacional</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastRows.map((row) => (
                    <tr key={row.fecha_mes}>
                      <td>{formatMonth(row.fecha_mes)}</td>
                      <td>
                        <strong>
                          ¥ {formatMoney(
                            row.precio_m2_predicho,
                          )}
                        </strong>
                      </td>
                      <td>
                        ¥ {formatMoney(
                          row.limite_inferior,
                        )}
                      </td>
                      <td>
                        ¥ {formatMoney(
                          row.limite_superior,
                        )}
                      </td>
                      <td>
                        {row.ajuste_estacional >= 0
                          ? '+'
                          : ''}
                        {formatMoney(
                          row.ajuste_estacional,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <div className="temporal-disclaimer">
            <strong>Uso recomendado:</strong>
            <span>
              El pronóstico representa una tendencia agregada
              del mercado y no reemplaza la tasación individual
              de una propiedad.
            </span>
          </div>
        </>
      )}
    </section>
  );
}