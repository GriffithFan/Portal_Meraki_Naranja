"use client";
import { useEffect, useState, useRef, ReactNode } from "react";
import "./Tooltip.css";

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  position?: "auto" | "top" | "bottom" | "left" | "right";
  modalOnMobile?: boolean;
}

const Tooltip = ({ children, content, position = "auto", modalOnMobile = true }: TooltipProps) => {
  const [visible, setVisible] = useState(false);
  const [calculatedPosition, setCalculatedPosition] = useState(position);
  const [isTouch, setIsTouch] = useState(false);
  const [fixedCoords, setFixedCoords] = useState<{ top: number; left: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const hasTouch = !!("ontouchstart" in window) || navigator.maxTouchPoints > 0;
      const hasHover = window.matchMedia?.("(hover: hover)").matches ?? false;
      setIsTouch(hasTouch && !hasHover);
    } catch { setIsTouch(false); }
  }, []);

  const close = () => setVisible(false);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouch) return;
    setVisible(true);
    try {
      const rect = e.currentTarget.getBoundingClientRect();
      const isTop = position === "auto" ? rect.top > window.innerHeight / 2 : position === "top";
      setCalculatedPosition(isTop ? "top" : "bottom");
      setFixedCoords({
        left: rect.left + rect.width / 2,
        top: isTop ? rect.top - 12 : rect.bottom + 12,
      });
    } catch {
      setCalculatedPosition("bottom");
      setFixedCoords(null);
    }
  };

  const handleMouseLeave = () => { if (!isTouch) setVisible(false); };

  const handleClick = (e: React.MouseEvent) => {
    if (!isTouch) return;
    e.stopPropagation();
    setVisible((v) => !v);
  };

  useEffect(() => {
    if (visible && isTouch && modalOnMobile) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [visible, isTouch, modalOnMobile]);

  useEffect(() => {
    if (!(visible && isTouch && modalOnMobile)) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setVisible(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, isTouch, modalOnMobile]);

  useEffect(() => {
    if (!(visible && isTouch && modalOnMobile)) return;
    const onPointerDown = (e: Event) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) setVisible(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [visible, isTouch, modalOnMobile]);

  if (!content) return <>{children}</>;

  return (
    <div ref={wrapperRef} className={`tooltip-wrapper${visible ? " tooltip-open" : ""}`} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onClick={handleClick}>
      {children}
      {visible && isTouch && modalOnMobile && (
        <>
          <div className="tooltip-modal-backdrop" onClick={close} />
          <div ref={modalRef} className="tooltip-modal-content" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="tooltip-modal-inner">
              {typeof content === "string" ? <div className="tooltip-modal-text">{content}</div> : content}
            </div>
          </div>
        </>
      )}
      {visible && (!isTouch || !modalOnMobile) && fixedCoords && (
        <div
          className={`tooltip-content tooltip-fixed tooltip-${calculatedPosition}`}
          style={{
            position: 'fixed',
            left: fixedCoords.left,
            top: fixedCoords.top,
            transform: calculatedPosition === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          }}
        >
          {typeof content === "string" ? <div>{content}</div> : content}
        </div>
      )}
    </div>
  );
};

export default Tooltip;
