"""
Script para generar el paquete de vectores técnicos de Salva para fabricantes y proveedores:
- salva-logo-color.svg
- salva-logo-monocromo-laser.svg
- salva-isotipo-emblema.svg
- salva-placa-grabado-especificacion.svg
Y conversión automática a vector PDF mediante Chrome Headless.
"""

import os
import subprocess

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'recursos-proveedor')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -------------------------------------------------------------
# 1. SALVA ISOTIPO EMBLEMA (Color & Monocromo)
# Corazón estilizado + Pin de Geolocalización de Auxilio
# -------------------------------------------------------------

def generar_isotipo():
    # Full Color
    svg_color = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
  <defs>
    <linearGradient id="gradHeart" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="50%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#0284C7"/>
    </linearGradient>
    <linearGradient id="gradPin" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0EA5E9"/>
      <stop offset="100%" stop-color="#0369A1"/>
    </linearGradient>
    <linearGradient id="gradRing" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#334155"/>
    </linearGradient>
    <filter id="subtleDrop" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.15"/>
    </filter>
  </defs>

  <!-- Corazón de Vida / Contorno Clínico -->
  <path d="M 250, 115 
           C 220, 55, 120, 45, 75, 115 
           C 25, 195, 80, 290, 250, 415 
           C 420, 290, 475, 195, 425, 115 
           C 380, 45, 280, 55, 250, 115 Z" 
        fill="none" 
        stroke="url(#gradHeart)" 
        stroke-width="38" 
        stroke-linecap="round" 
        stroke-linejoin="round"
        filter="url(#subtleDrop)"/>

  <!-- Anillo Protector Salva Band / Sensor -->
  <path d="M 115, 335
           C 160, 395, 340, 395, 385, 335
           C 400, 315, 415, 290, 395, 280
           C 355, 260, 145, 260, 105, 280
           C 85, 290, 100, 315, 115, 335 Z"
        fill="url(#gradRing)"
        opacity="0.95"/>

  <!-- Pin de Geolocalización Médica -->
  <g filter="url(#subtleDrop)">
    <path d="M 250, 320 
             C 240, 300, 175, 215, 175, 175 
             A 75, 75 0 1, 1 325, 175 
             C 325, 215, 260, 300, 250, 320 Z" 
          fill="url(#gradPin)"/>
    <!-- Orificio central del Pin -->
    <circle cx="250" cy="175" r="30" fill="#FFFFFF"/>
  </g>

  <!-- Pastilla / Sensor Indicador en Pulsera -->
  <rect x="220" y="325" width="60" height="14" rx="7" fill="#38BDF8"/>
</svg>'''

    # Monocromo Puro para Grabado Láser (Curvas 100% Negro)
    svg_mono = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
  <!-- Corazón de Vida / Contorno -->
  <path d="M 250, 115 
           C 220, 55, 120, 45, 75, 115 
           C 25, 195, 80, 290, 250, 415 
           C 420, 290, 475, 195, 425, 115 
           C 380, 45, 280, 55, 250, 115 Z" 
        fill="none" 
        stroke="#000000" 
        stroke-width="36" 
        stroke-linecap="round" 
        stroke-linejoin="round"/>

  <!-- Anillo Inferior / Base -->
  <path d="M 125, 330
           C 165, 385, 335, 385, 375, 330
           C 385, 315, 395, 295, 380, 285
           C 345, 265, 155, 265, 120, 285
           C 105, 295, 115, 315, 125, 330 Z"
        fill="#000000"/>

  <!-- Pin de Geolocalización -->
  <path d="M 250, 315 
           C 240, 295, 180, 215, 180, 175 
           A 70, 70 0 1, 1 320, 175 
           C 320, 215, 260, 295, 250, 315 Z" 
        fill="#000000"/>
  <!-- Orificio central en negativo -->
  <circle cx="250" cy="175" r="28" fill="#FFFFFF"/>
</svg>'''

    with open(os.path.join(OUTPUT_DIR, 'salva-isotipo-color.svg'), 'w', encoding='utf-8') as f:
        f.write(svg_color)
    with open(os.path.join(OUTPUT_DIR, 'salva-isotipo-laser-mono.svg'), 'w', encoding='utf-8') as f:
        f.write(svg_mono)

# -------------------------------------------------------------
# 2. LOGOTIPO COMPLETO (Símbolo + Tipografía SALVA + LC TECH)
# -------------------------------------------------------------

def generar_logotipo_completo():
    # Horizontal Full Color
    svg_logo_color = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300" width="100%" height="100%">
  <defs>
    <linearGradient id="gradHeartH" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="50%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#0284C7"/>
    </linearGradient>
    <linearGradient id="gradPinH" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0EA5E9"/>
      <stop offset="100%" stop-color="#0369A1"/>
    </linearGradient>
    <linearGradient id="gradBandH" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#334155"/>
    </linearGradient>
  </defs>

  <!-- ISOTIPO IZQUIERDA -->
  <g transform="translate(40, 20) scale(0.52)">
    <!-- Corazón -->
    <path d="M 250, 115 C 220, 55, 120, 45, 75, 115 C 25, 195, 80, 290, 250, 415 C 420, 290, 475, 195, 425, 115 C 380, 45, 280, 55, 250, 115 Z" 
          fill="none" stroke="url(#gradHeartH)" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- Anillo Base -->
    <path d="M 115, 335 C 160, 395, 340, 395, 385, 335 C 400, 315, 415, 290, 395, 280 C 355, 260, 145, 260, 105, 280 C 85, 290, 100, 315, 115, 335 Z" fill="url(#gradBandH)"/>
    <!-- Pin -->
    <path d="M 250, 320 C 240, 300, 175, 215, 175, 175 A 75, 75 0 1, 1 325, 175 C 325, 215, 260, 300, 250, 320 Z" fill="url(#gradPinH)"/>
    <circle cx="250" cy="175" r="30" fill="#FFFFFF"/>
    <!-- Barra sensor -->
    <rect x="220" y="325" width="60" height="14" rx="7" fill="#38BDF8"/>
  </g>

  <!-- TIPOGRAFÍA SALVA -->
  <g transform="translate(340, 160)">
    <!-- Letras SALVA trazadas o con tipografía robusta -->
    <text x="0" y="0" font-family="'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif" font-weight="800" font-size="115" fill="#0F172A" letter-spacing="-1">Salva</text>
    
    <!-- Subtítulo de Auxilio -->
    <text x="5" y="44" font-family="'Inter', sans-serif" font-weight="700" font-size="19" fill="#0284C7" letter-spacing="4">EMERGENCIA MÉDICA · QR &amp; NFC</text>
    <text x="5" y="70" font-family="'Inter', sans-serif" font-weight="600" font-size="14" fill="#64748B" letter-spacing="2">TECNOLOGÍA DE SALVAGUARDA · LC TECH</text>
  </g>

  <!-- ONDA NFC VECTORIAL -->
  <g transform="translate(680, 75)" stroke="#0EA5E9" stroke-width="4.5" fill="none" stroke-linecap="round">
    <path d="M 10, 20 A 15, 15 0 0, 1 10, 50"/>
    <path d="M 18, 12 A 25, 25 0 0, 1 18, 58"/>
    <path d="M 26, 4  A 35, 35 0 0, 1 26, 66"/>
  </g>
</svg>'''

    # Horizontal Monocromo Láser (Curvas 100% Negro)
    svg_logo_mono = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300" width="100%" height="100%">
  <!-- ISOTIPO IZQUIERDA -->
  <g transform="translate(40, 20) scale(0.52)">
    <path d="M 250, 115 C 220, 55, 120, 45, 75, 115 C 25, 195, 80, 290, 250, 415 C 420, 290, 475, 195, 425, 115 C 380, 45, 280, 55, 250, 115 Z" 
          fill="none" stroke="#000000" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 125, 330 C 165, 385, 335, 385, 375, 330 C 385, 315, 395, 295, 380, 285 C 345, 265, 155, 265, 120, 285 C 105, 295, 115, 315, 125, 330 Z" fill="#000000"/>
    <path d="M 250, 315 C 240, 295, 180, 215, 180, 175 A 70, 70 0 1, 1 320, 175 C 320, 215, 260, 295, 250, 315 Z" fill="#000000"/>
    <circle cx="250" cy="175" r="28" fill="#FFFFFF"/>
  </g>

  <!-- TIPOGRAFÍA SALVA -->
  <g transform="translate(340, 160)">
    <text x="0" y="0" font-family="'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif" font-weight="800" font-size="115" fill="#000000" letter-spacing="-1">Salva</text>
    <text x="5" y="44" font-family="'Inter', sans-serif" font-weight="700" font-size="19" fill="#000000" letter-spacing="4">EMERGENCIA MÉDICA · QR &amp; NFC</text>
    <text x="5" y="70" font-family="'Inter', sans-serif" font-weight="600" font-size="14" fill="#000000" letter-spacing="2">TECNOLOGÍA DE SALVAGUARDA · LC TECH</text>
  </g>

  <!-- ONDA NFC VECTORIAL -->
  <g transform="translate(680, 75)" stroke="#000000" stroke-width="5" fill="none" stroke-linecap="round">
    <path d="M 10, 20 A 15, 15 0 0, 1 10, 50"/>
    <path d="M 18, 12 A 25, 25 0 0, 1 18, 58"/>
    <path d="M 26, 4  A 35, 35 0 0, 1 26, 66"/>
  </g>
</svg>'''

    with open(os.path.join(OUTPUT_DIR, 'salva-logo-color.svg'), 'w', encoding='utf-8') as f:
        f.write(svg_logo_color)
    with open(os.path.join(OUTPUT_DIR, 'salva-logo-laser-mono.svg'), 'w', encoding='utf-8') as f:
        f.write(svg_logo_mono)

# -------------------------------------------------------------
# 3. PLANO TÉCNICO DE GRABADO LÁSER EN PLACA METÁLICA (316L)
# Como se vio en la muestra física 'salva-product.jpg':
# [ Estrella de la Vida ] + [ QR Code Matrix ] + [ LC ))) SALVA ]
# -------------------------------------------------------------

def generar_especificacion_placa_laser():
    svg_placa = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" width="100%" height="100%">
  <defs>
    <!-- Acero Inoxidable Cepillado 316L -->
    <linearGradient id="metalBrushed" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E2E8F0"/>
      <stop offset="50%" stop-color="#CBD5E1"/>
      <stop offset="100%" stop-color="#94A3B8"/>
    </linearGradient>
    <filter id="placaShadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-opacity="0.2"/>
    </filter>
  </defs>

  <!-- Fondo de Área de Trabajo -->
  <rect width="1200" height="600" fill="#F8FAFC"/>

  <!-- Título y Cotas Técnicas -->
  <text x="60" y="55" font-family="'Inter', sans-serif" font-weight="800" font-size="24" fill="#0F172A">LC SALVA · ESPECIFICACIÓN DE GRABADO LÁSER (PLACA ACERO 316L)</text>
  <text x="60" y="82" font-family="'Inter', sans-serif" font-weight="500" font-size="14" fill="#64748B">Apto para Salva Band (cápsula 38x14mm) y Salva Watch (pasador deslizable 30x18mm para correa 20/22mm)</text>

  <!-- PLACA FÍSICA SIMULADA (Proporción Pasador) -->
  <g transform="translate(100, 120)" filter="url(#placaShadow)">
    <!-- Contorno placa metálica con esquinas redondeadas -->
    <rect x="0" y="0" width="1000" height="340" rx="40" fill="url(#metalBrushed)" stroke="#64748B" stroke-width="3"/>
    <!-- Borde interior biselado -->
    <rect x="10" y="10" width="980" height="320" rx="32" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.6"/>

    <!-- ================= 1. ESTRELLA DE LA VIDA (MÉDICA) ================= -->
    <g transform="translate(140, 170) scale(1.4)">
      <!-- 6 Brazos de la Estrella de la Vida -->
      <g fill="#0F172A">
        <!-- Brazo Vertical -->
        <rect x="-14" y="-80" width="28" height="160" rx="4"/>
        <!-- Brazo 60 deg -->
        <rect x="-14" y="-80" width="28" height="160" rx="4" transform="rotate(60)"/>
        <!-- Brazo 120 deg -->
        <rect x="-14" y="-80" width="28" height="160" rx="4" transform="rotate(120)"/>
      </g>
      <!-- Vara de Esculapio y Serpiente (Símbolo de Medicina en negativo) -->
      <!-- Vara -->
      <line x1="0" y1="-70" x2="0" y2="70" stroke="#CBD5E1" stroke-width="6" stroke-linecap="round"/>
      <!-- Serpiente enrollada -->
      <path d="M 0, -60 
               C 18, -50, 18, -35, 0, -25
               C -18, -15, -18, 0, 0, 10
               C 18, 20, 18, 35, 0, 45
               C -18, 55, -10, 65, 0, 65" 
            fill="none" stroke="#CBD5E1" stroke-width="5" stroke-linecap="round"/>
    </g>

    <!-- ================= 2. ZONA CÓDIGO QR MATRICIAL ================= -->
    <g transform="translate(380, 50)">
      <!-- Marco delimitador con zona de silencio -->
      <rect x="0" y="0" width="240" height="240" rx="12" fill="#FFFFFF"/>
      
      <!-- Ojos de esquina QR -->
      <!-- Superior Izquierda -->
      <rect x="20" y="20" width="55" height="55" rx="6" fill="#0F172A"/>
      <rect x="30" y="30" width="35" height="35" rx="4" fill="#FFFFFF"/>
      <rect x="38" y="38" width="19" height="19" rx="2" fill="#0F172A"/>

      <!-- Superior Derecha -->
      <rect x="165" y="20" width="55" height="55" rx="6" fill="#0F172A"/>
      <rect x="175" y="30" width="35" height="35" rx="4" fill="#FFFFFF"/>
      <rect x="183" y="38" width="19" height="19" rx="2" fill="#0F172A"/>

      <!-- Inferior Izquierda -->
      <rect x="20" y="165" width="55" height="55" rx="6" fill="#0F172A"/>
      <rect x="30" y="175" width="35" height="35" rx="4" fill="#FFFFFF"/>
      <rect x="38" y="183" width="19" height="19" rx="2" fill="#0F172A"/>

      <!-- Módulos de datos representativos (Láser de alta densidad) -->
      <g fill="#0F172A">
        <rect x="95" y="25" width="12" height="12"/>
        <rect x="115" y="25" width="24" height="12"/>
        <rect x="95" y="45" width="12" height="24"/>
        <rect x="120" y="55" width="12" height="12"/>
        <rect x="140" y="45" width="12" height="35"/>
        
        <rect x="25" y="95" width="24" height="12"/>
        <rect x="60" y="95" width="12" height="12"/>
        <rect x="85" y="85" width="14" height="24"/>
        <rect x="110" y="95" width="24" height="12"/>
        <rect x="145" y="95" width="14" height="24"/>
        <rect x="170" y="95" width="12" height="12"/>
        <rect x="195" y="95" width="20" height="12"/>

        <rect x="25" y="120" width="12" height="24"/>
        <rect x="50" y="120" width="24" height="12"/>
        <rect x="85" y="120" width="14" height="14"/>
        <rect x="110" y="120" width="35" height="14"/>
        <rect x="160" y="120" width="24" height="14"/>
        <rect x="195" y="120" width="20" height="24"/>

        <rect x="95" y="150" width="24" height="12"/>
        <rect x="130" y="150" width="12" height="24"/>
        <rect x="155" y="150" width="24" height="12"/>
        <rect x="190" y="150" width="25" height="12"/>

        <rect x="95" y="180" width="14" height="24"/>
        <rect x="120" y="180" width="24" height="12"/>
        <rect x="155" y="180" width="14" height="35"/>
        <rect x="180" y="190" width="35" height="14"/>

        <!-- Mini logo central en QR -->
        <circle cx="120" cy="120" r="14" fill="#FFFFFF"/>
        <circle cx="120" cy="120" r="10" fill="#0F172A"/>
      </g>
    </g>

    <!-- ================= 3. LOGO Y MARCA SALVA + NFC ================= -->
    <g transform="translate(690, 80)">
      <!-- Sello LC -->
      <text x="0" y="85" font-family="'Plus Jakarta Sans', 'Inter', sans-serif" font-weight="900" font-size="82" fill="#0F172A" letter-spacing="-1">LC</text>
      
      <!-- Ondas NFC -->
      <g transform="translate(130, 15)" stroke="#0F172A" stroke-width="7" fill="none" stroke-linecap="round">
        <path d="M 0, 25 A 20, 20 0 0, 1 0, 65"/>
        <path d="M 16, 12 A 38, 38 0 0, 1 16, 78"/>
        <path d="M 32, 0  A 54, 54 0 0, 1 32, 90"/>
      </g>

      <!-- Texto SALVA -->
      <text x="0" y="160" font-family="'Plus Jakarta Sans', 'Inter', sans-serif" font-weight="800" font-size="54" fill="#0F172A" letter-spacing="4">SALVA</text>
      
      <!-- Subtítulo de Auxilio -->
      <text x="2" y="195" font-family="'Inter', sans-serif" font-weight="600" font-size="16" fill="#334155" letter-spacing="2">MEDICAL SOS ID</text>
    </g>
  </g>

  <!-- NOTAS DE PRODUCCIÓN INDUSTRIAL -->
  <g transform="translate(100, 500)" font-family="'Inter', sans-serif" font-size="12" fill="#475569">
    <text x="0" y="0"><tspan font-weight="700" fill="#0F172A">Material base:</tspan> Acero Inoxidable Quirúrgico AISI 316L (resistente a corrosión marina y sudor).</text>
    <text x="0" y="20"><tspan font-weight="700" fill="#0F172A">Método de grabado:</tspan> Láser Fibra MOPA / Galvo (Recocido térmico 'Black Annealing' permanente, profundidad ~0.03 mm sin rebabas).</text>
    <text x="0" y="40"><tspan font-weight="700" fill="#0F172A">Requisitos QR:</tspan> Mínimo 12x12 mm con zona libre perimetral (Quiet Zone ≥ 1.5 mm). Resolución óptica ≥ 600 DPI para escaneo instantáneo.</text>
  </g>
</svg>'''

    with open(os.path.join(OUTPUT_DIR, 'salva-placa-grabado-laser-especificacion.svg'), 'w', encoding='utf-8') as f:
        f.write(svg_placa)

# -------------------------------------------------------------
# 4. HOJA RESUMEN HTML PARA CONVERTIR A PDF VECTORIAL VIA CHROME
# -------------------------------------------------------------

def generar_html_impresion():
    html_content = f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>LC Salva - Manual de Identidad Vectorial y Grabado Láser</title>
<style>
  @page {{
    size: A4 landscape;
    margin: 12mm;
  }}
  * {{
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}
  body {{
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #0F172A;
    background: #FFFFFF;
    margin: 0;
    padding: 0;
  }}
  .header {{
    border-bottom: 2px solid #0F172A;
    padding-bottom: 12px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }}
  .header h1 {{
    margin: 0;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.5px;
  }}
  .header p {{
    margin: 4px 0 0;
    color: #64748B;
    font-size: 13px;
  }}
  .badge-confidential {{
    background: #0F172A;
    color: #FFFFFF;
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    border-radius: 4px;
  }}
  .grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }}
  .card {{
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 16px;
    background: #F8FAFC;
  }}
  .card-title {{
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #0369A1;
    margin-bottom: 12px;
  }}
  .card-full {{
    grid-column: 1 / -1;
  }}
  .svg-box {{
    background: #FFFFFF;
    border: 1px dashed #CBD5E1;
    border-radius: 6px;
    padding: 12px;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 140px;
  }}
  .svg-box img {{
    max-width: 100%;
    max-height: 130px;
  }}
  .tech-specs {{
    margin-top: 14px;
    font-size: 11px;
    line-height: 1.6;
    color: #334155;
  }}
  .tech-specs strong {{
    color: #0F172A;
  }}
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>LC SALVA · FICHA TÉCNICA DE IDENTIDAD Y GRABADO LÁSER</h1>
    <p>Documento de Especificaciones Técnicas para Fabricación de Pulseras (Salva Band) y Pasadores de Reloj (Salva Watch)</p>
  </div>
  <div class="badge-confidential">Producción Industrial</div>
</div>

<div class="grid">
  <!-- Tarjeta 1: Logo Color -->
  <div class="card">
    <div class="card-title">1. Logotipo Corporativo (Uso en Impresión / Packaging)</div>
    <div class="svg-box">
      <img src="salva-logo-color.svg" alt="Salva Logo Color">
    </div>
    <div class="tech-specs">
      <strong>Paleta cromática:</strong> Emerald (#10B981), Cyan (#06B6D4), Medical Blue (#0284C7), Dark Slate (#0F172A).<br>
      <strong>Aplicación:</strong> Serigrafía en estuches, tarjetas de garantía, packaging y serigrafía en silicona.
    </div>
  </div>

  <!-- Tarjeta 2: Logo Monocromo Láser -->
  <div class="card">
    <div class="card-title">2. Versión Monocromática Láser (Curvas 100% K)</div>
    <div class="svg-box">
      <img src="salva-logo-laser-mono.svg" alt="Salva Logo Láser Monocromo">
    </div>
    <div class="tech-specs">
      <strong>Formato:</strong> Trazos vectoriales cerrados sin gradientes ni medios tonos (100% Black).<br>
      <strong>Compatibilidad:</strong> Software EzCad, LightBurn, máquinas de marcado láser Fibra / MOPA y CNC.
    </div>
  </div>

  <!-- Tarjeta 3: Isotipo Emblema -->
  <div class="card">
    <div class="card-title">3. Isotipo / Emblema de Auxilio (Corazón + Geoubicación)</div>
    <div class="svg-box" style="gap: 24px;">
      <img src="salva-isotipo-color.svg" alt="Isotipo Color" style="max-height: 110px;">
      <img src="salva-isotipo-laser-mono.svg" alt="Isotipo Monocromo" style="max-height: 110px;">
    </div>
    <div class="tech-specs">
      <strong>Significado:</strong> Corazón de soporte vital + Chincheta / Pin de geolocalización de rescate inmediato.<br>
      <strong>Uso:</strong> Relieve en pastilla central de la pulsera de silicona (debossed o embossed).
    </div>
  </div>

  <!-- Tarjeta 4: Especificación Placa Completa -->
  <div class="card">
    <div class="card-title">4. Distribución de Grabado en Placa Metálica 316L</div>
    <div class="svg-box">
      <img src="salva-placa-grabado-laser-especificacion.svg" alt="Placa Grabado Láser" style="max-height: 120px;">
    </div>
    <div class="tech-specs">
      <strong>Composición:</strong> Estrella de la vida médica (izquierda) + QR de alta resolución (centro) + Marca LC Salva / NFC (derecha).<br>
      <strong>Profundidad:</strong> 0.03 mm - 0.05 mm con acabado de recocido térmico oscuro (Black Annealing).
    </div>
  </div>
</div>

</body>
</html>'''

    html_path = os.path.join(OUTPUT_DIR, 'salva-especificacion-proveedor.html')
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    return html_path

def convertir_a_pdf(html_path):
    chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
    bin_path = chrome_path if os.path.exists(chrome_path) else edge_path

    # Ficha resumen técnica
    pdf_path = os.path.join(OUTPUT_DIR, 'LC-Salva-Vectores-Grabado-Laser-Proveedor.pdf')
    cmd = [
        bin_path,
        '--headless',
        '--disable-gpu',
        '--no-pdf-header-footer',
        f'--print-to-pdf={pdf_path}',
        html_path
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"PDF Ficha Técnica generado en: {pdf_path}")
    except Exception as e:
        print(f"Error generando PDF Ficha Técnica: {e}")

    # Convertir cada SVG a su propio PDF vectorial individual
    for fname in os.listdir(OUTPUT_DIR):
        if fname.endswith('.svg'):
            svg_file = os.path.join(OUTPUT_DIR, fname)
            pdf_file = os.path.join(OUTPUT_DIR, fname[:-4] + '.pdf')
            cmd_svg = [
                bin_path,
                '--headless',
                '--disable-gpu',
                '--no-pdf-header-footer',
                f'--print-to-pdf={pdf_file}',
                svg_file
            ]
            try:
                subprocess.run(cmd_svg, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                print(f"Vector PDF generado: {fname[:-4]}.pdf")
            except Exception as e:
                print(f"Error en {fname}: {e}")

if __name__ == '__main__':
    generar_isotipo()
    generar_logotipo_completo()
    generar_especificacion_placa_laser()
    html_file = generar_html_impresion()
    convertir_a_pdf(html_file)
    print("Todos los archivos vectoriales y ficha de proveedor fueron generados exitosamente.")
