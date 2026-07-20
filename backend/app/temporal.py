from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query


router = APIRouter(
    prefix="/forecast",
    tags=["Serie temporal"],
)

BASE_DIR = Path(__file__).resolve().parents[2]
MODEL_PATH = (
    BASE_DIR
    / "models_pkl"
    / "modelo_theta_precio_m2_ajuste_estacional.pkl"
)


@lru_cache(maxsize=1)
def cargar_paquete_theta() -> dict[str, Any]:
    """
    Carga una sola vez el paquete Theta guardado por KNIME.
    """
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"No existe el modelo temporal: {MODEL_PATH}"
        )

    paquete = joblib.load(MODEL_PATH)

    if not isinstance(paquete, dict):
        raise TypeError(
            "El archivo Theta debe contener un diccionario."
        )

    return paquete


def extraer_resultado_theta(
    paquete: dict[str, Any],
) -> Any:
    """
    Admite la estructura actual:

    paquete["modelo"]["modelo_theta"]

    También acepta variantes anteriores.
    """
    contenedor = paquete.get("modelo", paquete)

    if hasattr(contenedor, "forecast"):
        return contenedor

    if isinstance(contenedor, dict):
        claves = (
            "modelo_theta",
            "resultado_theta",
            "theta_result",
            "resultado",
            "model",
        )

        for clave in claves:
            candidato = contenedor.get(clave)

            if (
                candidato is not None
                and hasattr(candidato, "forecast")
            ):
                return candidato

        for candidato in contenedor.values():
            if hasattr(candidato, "forecast"):
                return candidato

    raise RuntimeError(
        "No se encontró el resultado Theta dentro del PKL. "
        f"Claves superiores: {list(paquete.keys())}"
    )


def obtener_serie_historica(
    resultado_theta: Any,
) -> pd.Series:
    """
    Recupera la serie original utilizada por ThetaModel.
    """
    modelo = getattr(resultado_theta, "model", None)

    if modelo is None:
        modelo = getattr(resultado_theta, "_model", None)

    serie = getattr(modelo, "endog_orig", None)

    if serie is None:
        serie = getattr(modelo, "_y", None)

    if serie is None:
        raise RuntimeError(
            "El objeto Theta no conserva la serie histórica."
        )

    if isinstance(serie, pd.Series):
        historico = serie.astype(float).copy()
    else:
        valores = np.asarray(serie, dtype=float).reshape(-1)

        ultima_fecha = pd.Timestamp(
            getattr(
                resultado_theta,
                "ultima_fecha_entrenamiento",
                pd.Timestamp.today(),
            )
        )

        indice = pd.date_range(
            end=ultima_fecha,
            periods=len(valores),
            freq="MS",
        )

        historico = pd.Series(
            valores,
            index=indice,
            dtype=float,
        )

    if not isinstance(
        historico.index,
        pd.DatetimeIndex,
    ):
        historico.index = pd.to_datetime(
            historico.index,
            errors="coerce",
        )

    historico = (
        historico
        .dropna()
        .sort_index()
        .asfreq("MS")
    )

    if historico.isna().any():
        historico = historico.interpolate(
            method="linear",
            limit_direction="both",
        )

    return historico


def calcular_patron_estacional(
    serie: pd.Series,
) -> dict[int, float]:
    """
    Replica el patrón mensual calculado en el nodo KNIME.
    """
    tendencia = (
        serie
        .rolling(
            window=12,
            center=True,
            min_periods=6,
        )
        .mean()
        .bfill()
        .ffill()
    )

    desviacion = serie - tendencia

    tabla = pd.DataFrame({
        "mes": serie.index.month,
        "desviacion": desviacion.values,
    })

    patron = (
        tabla
        .groupby("mes")["desviacion"]
        .mean()
        .to_dict()
    )

    if not patron:
        return {
            mes: 0.0
            for mes in range(1, 13)
        }

    media = float(
        np.mean(
            list(patron.values())
        )
    )

    return {
        int(mes): float(valor - media)
        for mes, valor in patron.items()
    }


def obtener_intervalos(
    resultado_theta: Any,
    steps: int,
    forecast: pd.Series,
    historico: pd.Series,
) -> pd.DataFrame:
    """
    Usa prediction_intervals cuando está disponible.
    Si falla, calcula un intervalo aproximado con residuos.
    """
    try:
        intervalos = resultado_theta.prediction_intervals(
            steps=steps
        )

        intervalos = pd.DataFrame(
            intervalos,
            index=forecast.index,
        )

        if intervalos.shape[1] < 2:
            raise ValueError(
                "prediction_intervals no devolvió dos columnas."
            )

        return pd.DataFrame({
            "limite_inferior": pd.to_numeric(
                intervalos.iloc[:, 0],
                errors="coerce",
            ).values,
            "limite_superior": pd.to_numeric(
                intervalos.iloc[:, 1],
                errors="coerce",
            ).values,
        }, index=forecast.index)

    except Exception:
        try:
            fitted = pd.Series(
                resultado_theta.fittedvalues
            ).astype(float)

            fitted.index = historico.index[
                -len(fitted):
            ]

            residuos = (
                historico.loc[fitted.index]
                - fitted
            )

            sigma = float(
                np.nanstd(residuos)
            )

        except Exception:
            sigma = float(
                np.nanstd(
                    historico.diff().dropna()
                )
            )

        if not np.isfinite(sigma) or sigma <= 0:
            sigma = 1.0

        pasos = np.arange(
            1,
            steps + 1,
            dtype=float,
        )

        amplitud = (
            1.96
            * sigma
            * np.sqrt(pasos)
        )

        return pd.DataFrame({
            "limite_inferior": (
                forecast.values
                - amplitud
            ),
            "limite_superior": (
                forecast.values
                + amplitud
            ),
        }, index=forecast.index)


def construir_pronostico(
    paquete: dict[str, Any],
    resultado_theta: Any,
    historico: pd.Series,
    steps: int,
) -> pd.DataFrame:
    """
    Genera el forecast y aplica la misma recomposición
    estacional configurada en KNIME.
    """
    forecast_raw = resultado_theta.forecast(
        steps=steps
    )

    if isinstance(forecast_raw, pd.Series):
        forecast = (
            forecast_raw
            .astype(float)
            .copy()
        )
    else:
        indice = pd.date_range(
            start=(
                historico.index.max()
                + pd.offsets.MonthBegin(1)
            ),
            periods=steps,
            freq="MS",
        )

        forecast = pd.Series(
            np.asarray(
                forecast_raw,
                dtype=float,
            ).reshape(-1),
            index=indice,
        )

    if not isinstance(
        forecast.index,
        pd.DatetimeIndex,
    ):
        forecast.index = pd.date_range(
            start=(
                historico.index.max()
                + pd.offsets.MonthBegin(1)
            ),
            periods=len(forecast),
            freq="MS",
        )

    intervalos = obtener_intervalos(
        resultado_theta=resultado_theta,
        steps=steps,
        forecast=forecast,
        historico=historico,
    )

    aplicar_ajuste = bool(
        paquete.get(
            "aplicar_ajuste_estacional",
            False,
        )
    )

    intensidad = float(
        paquete.get(
            "intensidad_ajuste_estacional",
            0.0,
        )
    )

    patron = calcular_patron_estacional(
        historico
    )

    ajuste = pd.Series(
        [
            patron.get(
                int(fecha.month),
                0.0,
            )
            for fecha in forecast.index
        ],
        index=forecast.index,
        dtype=float,
    )

    if not aplicar_ajuste:
        ajuste[:] = 0.0
        intensidad = 0.0

    pred_original = forecast.copy()

    pred_ajustada = (
        pred_original
        + intensidad * ajuste
    ).clip(lower=1)

    ancho_inferior = (
        pred_original.values
        - intervalos[
            "limite_inferior"
        ].values
    )

    ancho_superior = (
        intervalos[
            "limite_superior"
        ].values
        - pred_original.values
    )

    salida = pd.DataFrame({
        "fecha_mes": forecast.index,
        "precio_m2_predicho": (
            pred_ajustada.values
        ),
        "precio_m2_predicho_original": (
            pred_original.values
        ),
        "ajuste_estacional": (
            ajuste.values
        ),
        "limite_inferior": (
            pred_ajustada.values
            - ancho_inferior
        ),
        "limite_superior": (
            pred_ajustada.values
            + ancho_superior
        ),
    })

    salida["limite_inferior"] = (
        salida["limite_inferior"]
        .clip(lower=1)
    )

    return salida


def limpiar_numero(
    valor: Any,
) -> float | None:
    try:
        numero = float(valor)

        if np.isfinite(numero):
            return numero

    except Exception:
        pass

    return None


@router.get("/theta/info")
def theta_info():
    """
    Informa si el archivo Theta está disponible y qué contiene.
    """
    try:
        paquete = cargar_paquete_theta()
        resultado = extraer_resultado_theta(
            paquete
        )
        historico = obtener_serie_historica(
            resultado
        )

        return {
            "disponible": True,
            "archivo": str(MODEL_PATH),
            "tipo_modelo": paquete.get(
                "tipo_modelo",
                "ThetaForecaster",
            ),
            "descripcion": paquete.get(
                "descripcion",
                "",
            ),
            "fecha_inicio": (
                historico.index.min()
                .strftime("%Y-%m-%d")
            ),
            "ultima_fecha_entrenamiento": (
                historico.index.max()
                .strftime("%Y-%m-%d")
            ),
            "n_meses_historicos": int(
                len(historico)
            ),
            "horizonte_guardado": int(
                paquete.get(
                    "horizonte_pronostico",
                    12,
                )
            ),
            "ajuste_estacional": bool(
                paquete.get(
                    "aplicar_ajuste_estacional",
                    False,
                )
            ),
            "intensidad_ajuste_estacional": float(
                paquete.get(
                    "intensidad_ajuste_estacional",
                    0.0,
                )
            ),
            "metricas_backtest": paquete.get(
                "metricas_backtest",
                {},
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "No se pudo inspeccionar el modelo Theta: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc


@router.get("/theta")
def forecast_theta(
    steps: int = Query(
        default=12,
        ge=1,
        le=36,
        description=(
            "Cantidad de meses futuros a pronosticar."
        ),
    ),
    history_months: int = Query(
        default=36,
        ge=12,
        le=120,
        description=(
            "Cantidad de meses históricos a enviar a la vista."
        ),
    ),
):
    """
    Entrega histórico, pronóstico, intervalos y métricas
    para la vista temporal del frontend.
    """
    try:
        paquete = cargar_paquete_theta()

        resultado = extraer_resultado_theta(
            paquete
        )

        historico_completo = obtener_serie_historica(
            resultado
        )

        pronostico = construir_pronostico(
            paquete=paquete,
            resultado_theta=resultado,
            historico=historico_completo,
            steps=steps,
        )

        historico = historico_completo.tail(
            history_months
        )

        metricas_raw = paquete.get(
            "metricas_backtest",
            {},
        )

        metricas = {
            "mae": limpiar_numero(
                metricas_raw.get("mae")
            ),
            "rmse": limpiar_numero(
                metricas_raw.get("rmse")
            ),
            "mape_pct": limpiar_numero(
                metricas_raw.get(
                    "mape_pct",
                    metricas_raw.get("mape"),
                )
            ),
        }

        ultimo_real = float(
            historico_completo.iloc[-1]
        )

        primer_forecast = float(
            pronostico[
                "precio_m2_predicho"
            ].iloc[0]
        )

        ultimo_forecast = float(
            pronostico[
                "precio_m2_predicho"
            ].iloc[-1]
        )

        variacion_absoluta = (
            ultimo_forecast
            - ultimo_real
        )

        variacion_pct = (
            variacion_absoluta
            / ultimo_real
            * 100
            if ultimo_real != 0
            else None
        )

        respuesta_historica = [
            {
                "fecha_mes": (
                    fecha.strftime("%Y-%m-%d")
                ),
                "precio_m2_real": round(
                    float(valor),
                    2,
                ),
            }
            for fecha, valor
            in historico.items()
        ]

        respuesta_pronostico = [
            {
                "fecha_mes": pd.Timestamp(
                    fila.fecha_mes
                ).strftime("%Y-%m-%d"),
                "precio_m2_predicho": round(
                    float(
                        fila.precio_m2_predicho
                    ),
                    2,
                ),
                "precio_m2_predicho_original": round(
                    float(
                        fila.precio_m2_predicho_original
                    ),
                    2,
                ),
                "ajuste_estacional": round(
                    float(
                        fila.ajuste_estacional
                    ),
                    2,
                ),
                "limite_inferior": round(
                    float(
                        fila.limite_inferior
                    ),
                    2,
                ),
                "limite_superior": round(
                    float(
                        fila.limite_superior
                    ),
                    2,
                ),
            }
            for fila in pronostico.itertuples(
                index=False
            )
        ]

        return {
            "modelo_temporal": paquete.get(
                "tipo_modelo",
                "ThetaForecaster",
            ),
            "descripcion": paquete.get(
                "descripcion",
                "",
            ),
            "archivo_modelo": str(
                MODEL_PATH
            ),
            "ultima_fecha_entrenamiento": (
                historico_completo.index.max()
                .strftime("%Y-%m-%d")
            ),
            "horizonte_meses": int(steps),
            "periodo_estacional": int(
                paquete.get(
                    "modelo",
                    {},
                ).get(
                    "periodo_estacional",
                    12,
                )
                if isinstance(
                    paquete.get("modelo"),
                    dict,
                )
                else 12
            ),
            "deseasonalize": bool(
                paquete.get(
                    "modelo",
                    {},
                ).get(
                    "deseasonalize",
                    True,
                )
                if isinstance(
                    paquete.get("modelo"),
                    dict,
                )
                else True
            ),
            "aplicar_ajuste_estacional": bool(
                paquete.get(
                    "aplicar_ajuste_estacional",
                    False,
                )
            ),
            "intensidad_ajuste_estacional": float(
                paquete.get(
                    "intensidad_ajuste_estacional",
                    0.0,
                )
            ),
            "metricas_backtest": metricas,
            "resumen": {
                "ultimo_precio_real": round(
                    ultimo_real,
                    2,
                ),
                "primer_precio_pronosticado": round(
                    primer_forecast,
                    2,
                ),
                "ultimo_precio_pronosticado": round(
                    ultimo_forecast,
                    2,
                ),
                "promedio_pronosticado": round(
                    float(
                        pronostico[
                            "precio_m2_predicho"
                        ].mean()
                    ),
                    2,
                ),
                "minimo_pronosticado": round(
                    float(
                        pronostico[
                            "precio_m2_predicho"
                        ].min()
                    ),
                    2,
                ),
                "maximo_pronosticado": round(
                    float(
                        pronostico[
                            "precio_m2_predicho"
                        ].max()
                    ),
                    2,
                ),
                "variacion_absoluta": round(
                    variacion_absoluta,
                    2,
                ),
                "variacion_pct": (
                    round(
                        float(variacion_pct),
                        2,
                    )
                    if variacion_pct is not None
                    else None
                ),
                "tendencia": (
                    "Alcista"
                    if variacion_absoluta > 0
                    else (
                        "Bajista"
                        if variacion_absoluta < 0
                        else "Estable"
                    )
                ),
            },
            "historico": respuesta_historica,
            "pronostico": respuesta_pronostico,
        }

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "No se pudo generar el pronóstico Theta: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc
