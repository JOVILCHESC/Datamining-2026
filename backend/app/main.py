# from fastapi import FastAPI, HTTPException
# from pydantic import BaseModel, Field
# import joblib
# import pandas as pd
# from fastapi.middleware.cors import CORSMiddleware

# app = FastAPI(title="Predicción de Precio Inmobiliario - Beijing")

# # Configuración CORS
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # Cargar el modelo en memoria al iniciar la API
# MODEL_PATH = "../models_pkl/pipeline_rf_precio_m2.pkl"

# @app.get("/health")
# def health_check():
#     return {"status": "ok", "modelo_cargado": pipeline is not None}

# @app.get("/model/info")
# def model_info():
#     return {
#         "algoritmo": "Random Forest Regressor",
#         "variable_objetivo": "precio_unitario_m2",
#         "descripcion": "Modelo entrenado para predecir el precio por metro cuadrado de propiedades en Beijing.",
#         "variables_esperadas": list(PropiedadInput.schema()["properties"].keys())
#     }
    
    
# @app.get("/forecast/precio-m2")
# def forecast_precio_m2(steps: int = 6):
#     if sarimax_pack is None:
#         raise HTTPException(
#             status_code=500,
#             detail="El modelo SARIMAX no está cargado."
#         )

#     modelo = sarimax_pack["modelo"]

#     # Usa la exógena futura guardada desde KNIME/Python
#     exog_futura = sarimax_pack.get("exog_futura_usada")

#     if exog_futura is None:
#         raise HTTPException(
#             status_code=500,
#             detail="No existe exog_futura_usada dentro del modelo SARIMAX."
#         )

#     exog_futura = exog_futura.head(steps)

#     forecast_obj = modelo.get_forecast(
#         steps=len(exog_futura),
#         exog=exog_futura
#     )

#     forecast = forecast_obj.predicted_mean
#     intervalos = forecast_obj.conf_int()

#     data = []

#     for i in range(len(forecast)):
#         data.append({
#             "fecha_mes": str(forecast.index[i].date()),
#             "precio_m2_predicho": round(float(forecast.iloc[i]), 2),
#             "limite_inferior": round(float(intervalos.iloc[i, 0]), 2),
#             "limite_superior": round(float(intervalos.iloc[i, 1]), 2),
#             "cantidad_ventas_usada": round(float(exog_futura.iloc[i, 0]), 2)
#         })

#     return {
#         "modelo": sarimax_pack.get(
#             "modelo_temporal",
#             "SARIMAX(1,1,1) con cantidad_ventas pronosticada"
#         ),
#         "variable_objetivo": "precio_m2_promedio",
#         "variable_exogena": sarimax_pack.get("exogenous_column", "cantidad_ventas"),
#         "mae_test": round(float(sarimax_pack.get("mae_test", 0)), 2),
#         "rmse_test": round(float(sarimax_pack.get("rmse_test", 0)), 2),
#         "mape_test": round(float(sarimax_pack.get("mape_test", 0)), 2),
#         "unidad": "Yuan por metro cuadrado",
#         "forecast": data
#     }
    
# @app.post("/predict/individual")
# def predict_individual(propiedad: PropiedadInput):
#     if not pipeline:
#         raise HTTPException(status_code=500, detail="El modelo no está cargado. Entrena el modelo primero ejecutando train.py")
    
#     # Convertir JSON a DataFrame (1 fila)
#     input_data = pd.DataFrame([propiedad.dict()])
    
#     try:
#         # Predecir usando el pipeline
#         prediccion = pipeline.predict(input_data)[0]
        
#         return {
#             "modelo": "Random Forest Regression",
#             "variable_objetivo": "precio_unitario_m2",
#             "precio_unitario_m2_predicho": round(float(prediccion), 2),
#             "unidad": "Yuan por metro cuadrado",
#             "mensaje": "Predicción generada correctamente"
#         }
#     except Exception as e:
#         raise HTTPException(status_code=400, detail=f"Error durante la predicción: {str(e)}")







from datetime import date

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import joblib
import pandas as pd
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

app = FastAPI(title="Predicción de Precio Inmobiliario - Beijing")


def current_sale_period() -> dict[str, int]:
    today = date.today()
    mes_venta = today.month
    return {
        "anio_venta": today.year,
        "mes_venta": mes_venta,
        "trimestre_venta": ((mes_venta - 1) // 3) + 1,
    }

# ============================================================
# Configuración CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# Rutas robustas de modelos
# ============================================================

# main.py está en: backend/app/main.py
# parents[2] apunta a la carpeta raíz del proyecto: Datamining 2026
BASE_DIR = Path(__file__).resolve().parents[2]
MODELS_DIR = BASE_DIR / "models_pkl"

RF_MODEL_PATH = MODELS_DIR / "pipeline_rf_precio_m2.pkl"
CLASSIFIER_MODEL_PATH = MODELS_DIR / "classifier_rf_venta_rapida.pkl"
SARIMAX_MODEL_PATH = MODELS_DIR / "modelo_sarimax_precio_m2_completo.pkl"

# ============================================================
# Cargar Random Forest Regressor
# ============================================================

try:
    pipeline = joblib.load(RF_MODEL_PATH)
except FileNotFoundError:
    pipeline = None

# ============================================================
# Cargar Random Forest Classifier
# ============================================================

try:
    classifier = joblib.load(CLASSIFIER_MODEL_PATH)
except FileNotFoundError:
    classifier = None

# ============================================================
# Cargar SARIMAX
# ============================================================

try:
    sarimax_pack = joblib.load(SARIMAX_MODEL_PATH)
except (FileNotFoundError, ModuleNotFoundError, ImportError, Exception):
    sarimax_pack = None


# ============================================================
# Esquema de entrada para predicción individual
# ============================================================

class PropiedadInput(BaseModel):
    longitud: float
    latitud: float
    superficie_total: float = Field(..., gt=0, description="Superficie total en metros cuadrados")
    cocina: int
    dormitorios: int
    sala_estar: int
    banios: int
    numero_pisos: int
    anio_construccion: int
    metro: int
    ascensor: int
    propiedad_cinco_anios: int
    tipo_edificio: str
    estado_renovacion: str
    estructura: str
    nombre_distrito: str
    nivel_piso: str


# ============================================================
# Endpoints generales
# ============================================================

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "modelo_random_forest_cargado": pipeline is not None,
        "modelo_sarimax_cargado": sarimax_pack is not None,
        "ruta_random_forest": str(RF_MODEL_PATH),
        "ruta_sarimax": str(SARIMAX_MODEL_PATH),
    }


@app.get("/model/info")
def model_info():
    return {
        "algoritmo": "Random Forest Regressor",
        "variable_objetivo": "precio_unitario_m2",
        "descripcion": "Modelo entrenado para predecir el precio por metro cuadrado de propiedades en Beijing usando el contexto temporal actual al momento de la consulta.",
        "variables_esperadas": list(PropiedadInput.model_json_schema()["properties"].keys())
    }


# ============================================================
# Endpoint de pronóstico temporal SARIMAX
# ============================================================

@app.get("/forecast/precio-m2")
def forecast_precio_m2(steps: int = 6):
    if sarimax_pack is None:
        raise HTTPException(
            status_code=500,
            detail=f"El modelo SARIMAX no está cargado. Revisa que exista: {SARIMAX_MODEL_PATH}"
        )

    if steps <= 0:
        raise HTTPException(
            status_code=400,
            detail="El parámetro steps debe ser mayor a 0."
        )

    modelo = sarimax_pack["modelo"]

    # Usa la exógena futura guardada desde KNIME/Python
    exog_futura = sarimax_pack.get("exog_futura_usada")

    if exog_futura is None:
        raise HTTPException(
            status_code=500,
            detail="No existe exog_futura_usada dentro del modelo SARIMAX."
        )

    # Limitar a la cantidad disponible
    exog_futura = exog_futura.head(steps)

    if len(exog_futura) == 0:
        raise HTTPException(
            status_code=500,
            detail="La exógena futura está vacía."
        )

    forecast_obj = modelo.get_forecast(
        steps=len(exog_futura),
        exog=exog_futura
    )

    forecast = forecast_obj.predicted_mean
    intervalos = forecast_obj.conf_int()

    data = []

    for i in range(len(forecast)):
        data.append({
            "fecha_mes": str(forecast.index[i].date()),
            "precio_m2_predicho": round(float(forecast.iloc[i]), 2),
            "limite_inferior": round(float(intervalos.iloc[i, 0]), 2),
            "limite_superior": round(float(intervalos.iloc[i, 1]), 2),
            "cantidad_ventas_usada": round(float(exog_futura.iloc[i, 0]), 2)
        })

    return {
        "modelo": sarimax_pack.get(
            "modelo_temporal",
            "SARIMAX(1,1,1) con cantidad_ventas pronosticada"
        ),
        "variable_objetivo": "precio_m2_promedio",
        "variable_exogena": sarimax_pack.get("exogenous_column", "cantidad_ventas"),
        "mae_test": round(float(sarimax_pack.get("mae_test", 0)), 2),
        "rmse_test": round(float(sarimax_pack.get("rmse_test", 0)), 2),
        "mape_test": round(float(sarimax_pack.get("mape_test", 0)), 2),
        "unidad": "Yuan por metro cuadrado",
        "forecast": data
    }


# ============================================================
# Endpoint predicción individual Random Forest
# ============================================================

@app.post("/predict/individual")
def predict_individual(propiedad: PropiedadInput):
    if pipeline is None:
        raise HTTPException(
            status_code=500,
            detail=f"El modelo Random Forest no está cargado. Revisa que exista: {RF_MODEL_PATH}"
        )

    input_data = propiedad.model_dump()
    input_data.update(current_sale_period())
    input_data = pd.DataFrame([input_data])

    try:
        prediccion = pipeline.predict(input_data)[0]

        return {
            "modelo": "Random Forest Regression",
            "variable_objetivo": "precio_unitario_m2",
            "precio_unitario_m2_predicho": round(float(prediccion), 2),
            "unidad": "Yuan por metro cuadrado",
            "mensaje": "Predicción generada correctamente"
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error durante la predicción: {str(e)}") from e


# ============================================================
# Endpoint predicción clasificación (rotación rápida vs lenta)
# ============================================================

@app.post("/predict/rotation")
def predict_rotation(propiedad: PropiedadInput):
    if classifier is None:
        raise HTTPException(
            status_code=500,
            detail=f"El modelo clasificador no está cargado. Revisa que exista: {CLASSIFIER_MODEL_PATH}"
        )

    input_data = propiedad.model_dump()
    input_data.update(current_sale_period())
    input_data = pd.DataFrame([input_data])

    try:
        prediccion = classifier.predict(input_data)[0]
        probabilidades = classifier.predict_proba(input_data)[0]

        rotacion = "Rápida (< 15 días)" if prediccion == 1 else "Lenta (> 15 días)"
        confianza = max(probabilidades) * 100

        return {
            "modelo": "Random Forest Classifier",
            "variable_objetivo": "venta_rapida",
            "clasificacion": rotacion,
            "probabilidad_rapida": round(float(probabilidades[1]), 4),
            "probabilidad_lenta": round(float(probabilidades[0]), 4),
            "confianza_prediccion": round(confianza, 2),
            "mensaje": "Predicción generada correctamente"
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error durante la predicción: {str(e)}") from e