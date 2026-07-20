import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib
import numpy as np

def train_model():
    print("Cargando dataset...")
    df = pd.read_csv('../data/dataset_limpio.csv')

    # Features y Target
    target = 'precio_unitario_m2'
    
    cat_columns = ['tipo_edificio', 'estado_renovacion', 'estructura', 'nombre_distrito', 'nivel_piso']
    num_columns = ['longitud', 'latitud', 'superficie_total', 'cocina', 'dormitorios', 
                   'sala_estar', 'banios', 'numero_pisos', 'anio_construccion',
                   'anio_venta', 'mes_venta', 'trimestre_venta',
                   'metro', 'ascensor', 'propiedad_cinco_anios']

    X = df[num_columns + cat_columns]
    y = df[target]

    # Split: 80% Train, 20% Test
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    print("Construyendo Pipeline...")
    # Preprocesamiento
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), num_columns),
            ('cat', OneHotEncoder(handle_unknown='ignore'), cat_columns)
        ])

    # Pipeline completo
    pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('model', RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1))
    ])

    print("Entrenando modelo (esto puede tomar un minuto)...")
    pipeline.fit(X_train, y_train)

    # Evaluación
    y_pred = pipeline.predict(X_test)
    r2 = r2_score(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))

    print(f"\n--- Métricas del Modelo ---")
    print(f"R²: {r2:.4f}")
    print(f"MAE: {mae:.2f}")
    print(f"RMSE: {rmse:.2f}")

    # Guardar Pipeline
    joblib.dump(pipeline, '../models_pkl/pipeline_rf_precio_m2.pkl')
    print("\nModelo guardado correctamente en 'models_pkl/pipeline_rf_precio_m2.pkl'")

if __name__ == "__main__":
    train_model()