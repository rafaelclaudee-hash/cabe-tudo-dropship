'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const AUTOPLAY_MS = 3000;
const SWIPE_THRESHOLD_PX = 50;
// Abaixo disso, um "arrasto" é só um clique normal — não deve trocar
// de slide nem cancelar o clique em algo dentro do slide (link/botão).
const CLICK_SUPPRESS_THRESHOLD_PX = 5;

/**
 * Carrossel genérico — autoplay, setas, bolinhas, arrastar (mouse e
 * touch). Cada slide mantém a PRÓPRIA altura natural (track usa
 * align-items: flex-start, não stretch) — o container mede a altura
 * do slide ATIVO via ResizeObserver e anima a transição por CSS.
 * Isso evita esticar/cortar um slide pra caber na altura de outro
 * com proporção completamente diferente (ex: banner de imagem vs.
 * hero com foto+texto lado a lado).
 */
export default function Carousel({ slides }: { slides: ReactNode[] }) {
  const slideCount = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [height, setHeight] = useState<number | undefined>(undefined);

  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragStartX = useRef(0);
  const dragDeltaX = useRef(0);
  const wasDragged = useRef(false);

  // Mede a altura natural do slide ATIVO e mantém o container sempre
  // do tamanho certo — de novo ao trocar de slide, e de novo sempre
  // que o próprio slide mudar de altura (resize da janela, por
  // exemplo, muda como o hero quebra linha).
  useLayoutEffect(() => {
    const activeSlide = slideRefs.current[index];
    if (!activeSlide) return;

    function updateHeight() {
      if (activeSlide) setHeight(activeSlide.offsetHeight);
    }

    updateHeight();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(activeSlide);
    return () => observer.disconnect();
  }, [index]);

  useEffect(() => {
    if (slideCount <= 1 || paused) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % slideCount);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [slideCount, paused]);

  function goTo(next: number) {
    setIndex(((next % slideCount) + slideCount) % slideCount);
  }

  function startDrag(clientX: number) {
    dragStartX.current = clientX;
    dragDeltaX.current = 0;
    setIsDragging(true);
    setPaused(true);
  }

  function moveDrag(clientX: number) {
    dragDeltaX.current = clientX - dragStartX.current;
  }

  function endDrag() {
    const delta = dragDeltaX.current;
    wasDragged.current = Math.abs(delta) > CLICK_SUPPRESS_THRESHOLD_PX;
    if (delta > SWIPE_THRESHOLD_PX) {
      goTo(index - 1);
    } else if (delta < -SWIPE_THRESHOLD_PX) {
      goTo(index + 1);
    }
    dragDeltaX.current = 0;
    setIsDragging(false);
    setPaused(false);
  }

  // Mouse: escuta no window enquanto arrasta, senão perde o "soltar"
  // se o cursor sair do carrossel no meio do gesto (touch não precisa
  // disso — o navegador mantém o touch "capturado" no elemento que
  // recebeu o touchstart, mesmo que o dedo mova pra fora dele).
  useEffect(() => {
    if (!isDragging) return;
    function onMove(e: MouseEvent) {
      moveDrag(e.clientX);
    }
    function onUp() {
      endDrag();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  if (slideCount === 0) return null;

  return (
    <div
      className="carousel"
      style={{ height }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onMouseDown={(e) => startDrag(e.clientX)}
      onTouchStart={(e) => startDrag(e.touches[0].clientX)}
      onTouchMove={(e) => moveDrag(e.touches[0].clientX)}
      onTouchEnd={endDrag}
      onClickCapture={(e) => {
        // Um arrasto de verdade não deve também disparar o clique em
        // cima de um link/botão que estava por baixo do dedo/cursor.
        if (wasDragged.current) {
          e.preventDefault();
          e.stopPropagation();
          wasDragged.current = false;
        }
      }}
    >
      <div
        className="carousel__track"
        style={{
          transform: `translateX(-${index * 100}%)`,
          transition: isDragging ? 'none' : 'transform 0.5s ease',
        }}
      >
        {slides.map((slide, i) => (
          <div
            className="carousel__slide"
            ref={(el) => {
              slideRefs.current[i] = el;
            }}
            key={i}
          >
            {slide}
          </div>
        ))}
      </div>

      {slideCount > 1 && (
        <>
          <button
            type="button"
            className="carousel__arrow carousel__arrow--prev"
            onClick={() => goTo(index - 1)}
            aria-label="Slide anterior"
          >
            ‹
          </button>
          <button
            type="button"
            className="carousel__arrow carousel__arrow--next"
            onClick={() => goTo(index + 1)}
            aria-label="Próximo slide"
          >
            ›
          </button>
          <div className="carousel__dots">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`carousel__dot${i === index ? ' carousel__dot--active' : ''}`}
                onClick={() => goTo(i)}
                aria-label={`Ir pro slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
