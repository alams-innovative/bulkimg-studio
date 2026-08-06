export type WorkArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WindowFrame = WorkArea;

const FALLBACK_FRAME: WindowFrame = {
  x: 40,
  y: 24,
  width: 1280,
  height: 760,
};

/**
 * Choose a centered restored size that remains inside the Windows work area.
 * The maximized state is applied separately after the visible WebView is ready.
 */
export function getInitialWindowFrame(workArea: WorkArea): WindowFrame {
  if (workArea.width <= 0 || workArea.height <= 0) return FALLBACK_FRAME;

  const width = Math.max(640, Math.min(1280, Math.floor(workArea.width * 0.92)));
  const height = Math.max(540, Math.min(800, Math.floor(workArea.height * 0.9)));

  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width: Math.min(width, workArea.width),
    height: Math.min(height, workArea.height),
  };
}
