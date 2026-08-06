import re

with open("src/pages/sm-banners.astro", "r") as f:
    content = f.read()

# 1. Add .banner-wrapper-vertical
css_to_add = """    .banner-wrapper-vertical {
      width: 360px;
      height: 640px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
      position: relative;
      flex-shrink: 0;
    }
"""
if ".banner-wrapper-vertical" not in content:
    content = content.replace(".banner-wrapper {", css_to_add + "    .banner-wrapper {")

# 2. Change Product Infrastructure to Operational Infrastructure
content = content.replace("Product Infrastructure", "Operational Infrastructure")

# 3. Remove all variant-pill divs
content = re.sub(r'\s*<div class="variant-pill">[^<]+</div>', '', content)

# 4. We need to append Category 2 before the end of .page-container
# The end of page-container is </div>\n</body>
cat2_html = """
    <!-- Category 2: Stories / Reels Banners (360x640) -->
    <div class="category-block">
      <div class="category-label">2. Carrusel Vertical, Portadas (360x640)</div>
      
      <div class="variants-carousel">
        
        <!-- Portada 1 -->
        <div class="carousel-slide">
          <div style="display: flex; align-items: center; margin-bottom: 16px; padding: 0 10px;">
            <div class="footer-text">
              <img src="/imgs/logo-cord-white.png" style="height: 14px; opacity: 0.8;" />
              <span style="opacity: 0.4;">|</span>
              Operational Infrastructure
            </div>
          </div>
          <div class="banner-wrapper-vertical" style="background-color: #0A192F;">
            <CordDynamicBg 
              client:only="react" 
              colors={{ base: '#0A192F', color1: '#38BDF8', color2: '#6670F4', color3: '#10B981' }} 
              grain={false}
            />
            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 10;">
              <h1 style="color: white; font-size: 24px; font-weight: 800; margin: 0; white-space: nowrap; letter-spacing: -0.02em;">Cotizaciones con IA</h1>
            </div>
          </div>
        </div>

        <!-- Portada 2 -->
        <div class="carousel-slide">
          <div style="display: flex; align-items: center; margin-bottom: 16px; padding: 0 10px;">
            <div class="footer-text">
              <img src="/imgs/logo-cord-white.png" style="height: 14px; opacity: 0.8;" />
              <span style="opacity: 0.4;">|</span>
              Operational Infrastructure
            </div>
          </div>
          <div class="banner-wrapper-vertical" style="background-color: #061F20;">
            <CordDynamicBg 
              client:only="react" 
              colors={{ base: '#061F20', color1: '#10B981', color2: '#047857', color3: '#F59E0B' }} 
              grain={false}
            />
            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 10;">
              <h1 style="color: white; font-size: 24px; font-weight: 800; margin: 0; white-space: nowrap; letter-spacing: -0.02em;">Cotizaciones interactivas</h1>
            </div>
          </div>
        </div>

        <!-- Portada 3 -->
        <div class="carousel-slide">
          <div style="display: flex; align-items: center; margin-bottom: 16px; padding: 0 10px;">
            <div class="footer-text">
              <img src="/imgs/logo-cord-white.png" style="height: 14px; opacity: 0.8;" />
              <span style="opacity: 0.4;">|</span>
              Operational Infrastructure
            </div>
          </div>
          <div class="banner-wrapper-vertical" style="background-color: #0F172A;">
            <CordDynamicBg 
              client:only="react" 
              colors={{ base: '#0F172A', color1: '#38BDF8', color2: '#6670F4', color3: '#10B981' }} 
              grain={false}
            />
            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 10;">
              <h1 style="color: white; font-size: 24px; font-weight: 800; margin: 0; white-space: nowrap; letter-spacing: -0.02em;">AI Quotes</h1>
            </div>
          </div>
        </div>

        <!-- Portada 4 -->
        <div class="carousel-slide">
          <div style="display: flex; align-items: center; margin-bottom: 16px; padding: 0 10px;">
            <div class="footer-text">
              <img src="/imgs/logo-cord-white.png" style="height: 14px; opacity: 0.8;" />
              <span style="opacity: 0.4;">|</span>
              Operational Infrastructure
            </div>
          </div>
          <div class="banner-wrapper-vertical" style="background-color: #1E1B4B;">
            <CordDynamicBg 
              client:only="react" 
              colors={{ base: '#1E1B4B', color1: '#6366F1', color2: '#8B5CF6', color3: '#D946EF' }} 
              grain={false}
            />
            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 10;">
              <h1 style="color: white; font-size: 24px; font-weight: 800; margin: 0; white-space: nowrap; letter-spacing: -0.02em;">Interactive Quotes</h1>
            </div>
          </div>
        </div>

        <!-- Portada 5 -->
        <div class="carousel-slide">
          <div style="display: flex; align-items: center; margin-bottom: 16px; padding: 0 10px;">
            <div class="footer-text">
              <img src="/imgs/logo-cord-white.png" style="height: 14px; opacity: 0.8;" />
              <span style="opacity: 0.4;">|</span>
              Operational Infrastructure
            </div>
          </div>
          <div class="banner-wrapper-vertical" style="background-color: #38BDF8;">
            <CordDynamicBg 
              client:only="react" 
              colors={{ base: '#38BDF8', color1: '#60A5FA', color2: '#FDE68A', color3: '#34D399' }} 
              grain={false}
            />
            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 10;">
              <h1 style="color: white; font-size: 24px; font-weight: 800; margin: 0; white-space: nowrap; letter-spacing: -0.02em;">Cord</h1>
            </div>
          </div>
        </div>

      </div>
    </div>
"""

content = content.replace("  </div>\n</body>", cat2_html + "\n  </div>\n</body>")

# Also, update category 1 label to match the naming convention
content = content.replace("1. Unified Sales Link Campaign (Swipe horizontal para ver variantes)", "1. Carrusel Horizontal, Banners (1200x630)")

with open("src/pages/sm-banners.astro", "w") as f:
    f.write(content)
