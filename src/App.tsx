import React, { useEffect, useRef } from 'react';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mistyLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const mistyLayer = mistyLayerRef.current;
    if (!canvas || !mistyLayer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const maskCanvas = document.createElement('canvas');
    const mCtx = maskCanvas.getContext('2d', { alpha: true });
    if (!mCtx) return;

    // OPTIMIZATION 1: Scale down the mask canvas significantly.
    // Generating a base64 image from a full-size canvas every frame is extremely slow.
    // By scaling it down to 15%, we process ~44x fewer pixels, making toDataURL near-instant.
    const MASK_SCALE = 0.15;

    const colors = [
      { r: 233, g: 30, b: 99 },   // Pink
      { r: 255, g: 152, b: 0 },   // Marigold
      { r: 0, g: 150, b: 136 },   // Teal
      { r: 103, g: 58, b: 183 },  // Purple
      { r: 212, g: 175, b: 55 }   // Gold
    ];

    let splashes: OrganicSplash[] = [];
    let animationFrameId: number;
    let isMaskUpdating = false;

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas!.width = w;
      canvas!.height = h;
      maskCanvas.width = w * MASK_SCALE;
      maskCanvas.height = h * MASK_SCALE;
      mCtx!.fillStyle = 'black';
      mCtx!.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      updateMaskDoubleBuffered();
    }

    class OrganicSplash {
      x: number;
      y: number;
      color: { r: number, g: number, b: number };
      maxRadius: number;
      radius: number;
      opacity: number;
      life: number;
      dripDelay: number;
      holdDuration: number;
      timer: number;
      decay: number;
      points: { angle: number, variance: number, currentDist: number }[];
      drips: { angle: number, width: number, length: number, maxLen: number, speed: number, path: { x: number, y: number }[] }[];
      finished: boolean;

      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.maxRadius = (window.innerWidth < 768 ? 40 : 60) + Math.random() * 45;
        this.radius = 0;
        this.opacity = 0.70;
        this.life = 1.0;
        this.dripDelay = 30;
        this.holdDuration = 180;
        this.timer = 0;
        this.decay = 0.025;
        this.points = [];
        this.drips = [];
        this.finished = false;

        const numPoints = 20;
        for (let i = 0; i < numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          this.points.push({
            angle,
            variance: 0.8 + Math.random() * 0.4,
            currentDist: 0
          });
        }

        const numDrips = 7;
        const sectorWidth = Math.PI * 0.4;
        const sectorStart = Math.PI * 0.5 - sectorWidth / 2;
        for (let i = 0; i < numDrips; i++) {
          const dripAngle = sectorStart + (i / (numDrips - 1)) * sectorWidth;
          this.drips.push({
            angle: dripAngle,
            width: 5 + Math.random() * 6,
            length: 0,
            maxLen: Math.max(window.innerHeight * 0.6, 400) + Math.random() * 200,
            speed: (2.75 + Math.random() * 4.75) * 0.7,
            path: []
          });
        }
      }

      update() {
        this.radius += (this.maxRadius - this.radius) * 0.15;
        this.points.forEach(p => {
          p.currentDist = this.radius * p.variance;
        });
        this.timer++;

        if (this.timer > this.dripDelay) {
          this.drips.forEach(d => {
            if (d.length < d.maxLen) {
              d.length += d.speed;
              d.speed *= 0.999;
              const startRadius = this.radius * 0.9;
              const startX = this.x + Math.cos(d.angle) * startRadius;
              const startY = this.y + Math.sin(d.angle) * startRadius;
              const currentX = startX;
              const currentY = startY + d.length;
              if (d.path.length === 0) {
                d.path.push({ x: startX, y: startY });
              }
              d.path.push({ x: currentX, y: currentY });
            }
          });
        }

        if (this.timer > this.holdDuration) {
          this.life -= this.decay;
        }
        if (this.life <= 0) this.finished = true;
      }

      draw(targetCtx: CanvasRenderingContext2D, isMask = false) {
        targetCtx.save();
        if (isMask) {
          targetCtx.scale(MASK_SCALE, MASK_SCALE);
          targetCtx.globalCompositeOperation = 'destination-out';
          targetCtx.fillStyle = 'white';
          targetCtx.strokeStyle = 'white';
          // Scale down the blur radius proportionally for the mask to keep the clearing tight
          targetCtx.filter = `blur(${Math.max(1, 20 * MASK_SCALE)}px)`;
        } else {
          const alpha = Math.max(0, this.life * this.opacity);
          targetCtx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${alpha})`;
          targetCtx.strokeStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${alpha})`;
          targetCtx.filter = 'blur(10px)';
        }

        targetCtx.beginPath();
        this.points.forEach((p, i) => {
          const px = this.x + Math.cos(p.angle) * p.currentDist;
          const py = this.y + Math.sin(p.angle) * p.currentDist;
          if (i === 0) targetCtx.moveTo(px, py);
          else {
            const prev = this.points[i - 1];
            const midAngle = (p.angle + prev.angle) / 2;
            const midDist = (p.currentDist + prev.currentDist) / 2;
            const cx = this.x + Math.cos(midAngle) * midDist * 1.3;
            const cy = this.y + Math.sin(midAngle) * midDist * 1.3;
            targetCtx.quadraticCurveTo(cx, cy, px, py);
          }
        });
        targetCtx.closePath();
        targetCtx.fill();

        if (this.timer > this.dripDelay) {
          this.drips.forEach(d => {
            if (d.path.length < 2) return;
            const alpha = Math.max(0, this.life * this.opacity);
            if (!isMask) {
              const grad = targetCtx.createLinearGradient(
                d.path[0].x, d.path[0].y,
                d.path[d.path.length - 1].x, d.path[d.path.length - 1].y
              );
              grad.addColorStop(0, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${alpha * 0.4})`);
              grad.addColorStop(0.2, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${alpha})`);
              targetCtx.strokeStyle = grad;
              targetCtx.fillStyle = grad;
            }
            targetCtx.beginPath();
            targetCtx.lineCap = 'round';
            targetCtx.lineJoin = 'round';
            targetCtx.lineWidth = d.width;
            targetCtx.moveTo(d.path[0].x, d.path[0].y);
            for (let i = 1; i < d.path.length; i++) {
              targetCtx.lineTo(d.path[i].x, d.path[i].y);
            }
            targetCtx.stroke();

            const tip = d.path[d.path.length - 1];
            targetCtx.beginPath();
            targetCtx.arc(tip.x, tip.y, d.width * 0.6, 0, Math.PI * 2);
            targetCtx.fill();
          });
        }
        targetCtx.restore();
      }
    }

    function updateMaskDoubleBuffered() {
      if (!mistyLayer || isMaskUpdating) return;

      isMaskUpdating = true;
      const maskUrl = maskCanvas.toDataURL();

      const img = new Image();
      img.onload = () => {
        if (mistyLayer) {
          mistyLayer.style.webkitMaskImage = `url(${maskUrl})`;
          mistyLayer.style.maskImage = `url(${maskUrl})`;
        }
        isMaskUpdating = false;
      };
      img.src = maskUrl;
    }

    function handleInteraction(x: number, y: number) {
      splashes.push(new OrganicSplash(x, y));
    }

    let frameCount = 0;
    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      if (splashes.length > 0) {
        let maskUpdated = false;
        splashes = splashes.filter(s => {
          s.update();
          s.draw(mCtx!, true);
          maskUpdated = true;
          if (!s.finished) {
            s.draw(ctx!, false);
            return true;
          }
          return false;
        });

        // OPTIMIZATION 2: Double-buffered adaptive throttling.
        // Instead of a fixed frame throttle, we only update the mask once the 
        // browser has fully decoded the previous one. This eliminates flickering
        // and scales performance across devices.
        if (maskUpdated) {
          updateMaskDoubleBuffered();
        }
      }
      frameCount++;
      animationFrameId = requestAnimationFrame(animate);
    }

    const onMouseDown = (e: MouseEvent) => handleInteraction(e.clientX, e.clientY);
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('resize', resize);

    resize();
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('touchstart', onTouchStart);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="h-screen w-full relative select-none bg-[#FDFBF7] overflow-hidden cursor-crosshair touch-none">
      {/* Paper Texture */}
      <div
        className="fixed inset-0 opacity-30 z-[1] mix-blend-multiply bg-cover bg-no-repeat"
        style={{ backgroundImage: 'url(https://lh3.googleusercontent.com/aida-public/AB6AXuDoC5lkcD5CkaHT_Ecq92QoS0Dkt-F8gnMoV_IeL2PbRjthtTPCivYksqMj4HtNZHZ8d5bqHuJMBdCsrjvFNC3mxQNarOvLprVhWY9U1rPzZ6F6jD3j0OCI7NjKeh1NFh0jbeG8bMRGef9K38Htu7MJVGYAECaQxqBcdGq96U3PDIMohLZ3VLVuK9jMLGoviFOK7DZwjAOLILYDDltHz79YenBC0kHcOCpz_GSjDsq3nzcN_Fsit-cxG_0rzXa7PkOTLg7tZ3lv4Mw)' }}
      ></div>

      {/* Clear Layer */}
      <div className="fixed inset-0 z-5 flex flex-col items-center justify-center text-center px-6">
        <div className="w-full max-w-[90vw] flex flex-col items-center justify-center -mt-20">
          <span className="font-sans text-[10px] sm:text-xs md:text-sm tracking-[0.6em] uppercase text-[#B63E33] font-bold mb-4 sm:mb-6">
            The Canvas of Joy
          </span>
          <div className="flex flex-col items-center">
            <h1
              className="text-6xl sm:text-8xl md:text-9xl lg:text-[10rem] font-bold leading-tight tracking-normal text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-orange-400 to-purple-500 pb-2"
              style={{ fontFamily: '"Comic Sans MS", "Comic Sans", cursive' }}
            >
              Happy Holi
            </h1>
          </div>
          <div className="my-8 sm:my-12">
            <div className="h-[1px] w-32 sm:w-48 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent"></div>
          </div>
          <p className="font-sans italic text-lg sm:text-2xl md:text-3xl text-[#8C7B70] font-light max-w-xl md:max-w-3xl mx-auto leading-relaxed px-4">
            "Let the vibrant pigments of Gulal find their way into the blank spaces of your life, painting a masterpiece of memories."
          </p>
        </div>

        <div className="absolute bottom-16 left-0 right-0 flex flex-col items-center space-y-6">
          <div className="flex flex-col items-center">
            <p className="font-script text-3xl sm:text-4xl text-[#2C241B]">With warmth,</p>
            <p className="font-serif text-xl sm:text-2xl tracking-[0.2em] text-[#2C241B] font-semibold uppercase">Aditya Raj Singh</p>
            <p className="font-sans text-[9px] tracking-[0.4em] text-[#B63E33] uppercase font-black">ARS Developers</p>
          </div>
        </div>
      </div>

      {/* Misty Layer */}
      <div
        ref={mistyLayerRef}
        className="fixed inset-0 z-20 bg-[#FDFBF7] pointer-events-none"
        style={{
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat'
        }}
      >
        <div className="absolute inset-0 bg-[#FDFBF7]/98 backdrop-blur-[80px]"></div>
        <div className="fixed inset-0 z-5 flex flex-col items-center justify-center text-center px-6 opacity-20 grayscale pointer-events-none">
          <div className="w-full max-w-[90vw] flex flex-col items-center justify-center -mt-20 blur-[10px]">
            <span className="font-sans text-[10px] sm:text-xs md:text-sm tracking-[0.6em] uppercase text-[#2C241B]">The Canvas of Joy</span>
            <div className="flex flex-col items-center">
              <h1
                className="text-6xl sm:text-8xl md:text-9xl lg:text-[10rem] font-bold leading-tight tracking-normal text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-orange-400 to-purple-500 pb-2"
                style={{ fontFamily: '"Comic Sans MS", "Comic Sans", cursive' }}
              >
                Happy Holi
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* Interaction Canvas */}
      <canvas
        ref={canvasRef}
        className="fixed top-0 left-0 w-full h-full z-30 pointer-events-auto"
      />

      {/* Corner Borders */}
      <div className="fixed inset-0 z-40 pointer-events-none p-6 md:p-12 flex flex-col justify-between">
        <div className="flex justify-between">
          <div className="w-12 h-12 md:w-20 md:h-20 border-t border-l border-[#D4AF37]/30 relative">
            <div className="absolute -top-1 -left-1 w-1.5 h-1.5 bg-[#D4AF37]/50 rounded-full"></div>
          </div>
          <div className="w-12 h-12 md:w-20 md:h-20 border-t border-r border-[#D4AF37]/30 relative">
            <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-[#D4AF37]/50 rounded-full"></div>
          </div>
        </div>
        <div className="flex justify-between">
          <div className="w-12 h-12 md:w-20 md:h-20 border-b border-l border-[#D4AF37]/30 relative">
            <div className="absolute -bottom-1 -left-1 w-1.5 h-1.5 bg-[#D4AF37]/50 rounded-full"></div>
          </div>
          <div className="w-12 h-12 md:w-20 md:h-20 border-b border-r border-[#D4AF37]/30 relative">
            <div className="absolute -bottom-1 -right-1 w-1.5 h-1.5 bg-[#D4AF37]/50 rounded-full"></div>
          </div>
        </div>

        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
          <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-[#2C241B] font-bold animate-pulse drop-shadow-md">
            Click to wash the canvas with color
          </p>
        </div>
      </div>
    </div>
  );
}
