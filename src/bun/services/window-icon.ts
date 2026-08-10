import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";

const IMAGE_ICON = 1;
const LR_LOADFROMFILE = 0x0010;
const WM_SETICON = 0x0080;
const ICON_SMALL = 0;
const ICON_BIG = 1;
const DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
const DWMWA_USE_IMMERSIVE_DARK_MODE_LEGACY = 19;

let largeIcon: Pointer | null = null;
let smallIcon: Pointer | null = null;

const user32 = dlopen("user32.dll", {
  FindWindowW: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  LoadImageW: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32],
    returns: FFIType.ptr,
  },
  SendMessageW: {
    args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.ptr],
    returns: FFIType.ptr,
  },
});

const dwmapi = dlopen("dwmapi.dll", {
  DwmSetWindowAttribute: {
    args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32],
    returns: FFIType.i32,
  },
});

function wide(value: string): Buffer {
  return Buffer.from(`${value}\0`, "utf16le");
}

/** Assign the branded ICO to the native Windows title bar and taskbar window. */
export function setNativeWindowIcon(windowTitle: string, iconPath: string): boolean {
  const title = wide(windowTitle);
  const path = wide(iconPath);
  const windowHandle = user32.symbols.FindWindowW(null, ptr(title));
  if (!windowHandle) return false;

  largeIcon ??= user32.symbols.LoadImageW(null, ptr(path), IMAGE_ICON, 32, 32, LR_LOADFROMFILE);
  smallIcon ??= user32.symbols.LoadImageW(null, ptr(path), IMAGE_ICON, 16, 16, LR_LOADFROMFILE);
  if (!largeIcon || !smallIcon) return false;

  user32.symbols.SendMessageW(windowHandle, WM_SETICON, ICON_BIG, largeIcon);
  user32.symbols.SendMessageW(windowHandle, WM_SETICON, ICON_SMALL, smallIcon);
  return true;
}

/** Apply Windows' immersive dark title-bar mode before the app window is revealed. */
export function setNativeWindowDarkMode(windowTitle: string, enabled: boolean): boolean {
  const title = wide(windowTitle);
  const windowHandle = user32.symbols.FindWindowW(null, ptr(title));
  if (!windowHandle) return false;

  const value = new Int32Array([enabled ? 1 : 0]);
  const size = Int32Array.BYTES_PER_ELEMENT;
  const currentResult = dwmapi.symbols.DwmSetWindowAttribute(
    windowHandle,
    DWMWA_USE_IMMERSIVE_DARK_MODE,
    ptr(value),
    size,
  );
  if (currentResult === 0) return true;

  return dwmapi.symbols.DwmSetWindowAttribute(
    windowHandle,
    DWMWA_USE_IMMERSIVE_DARK_MODE_LEGACY,
    ptr(value),
    size,
  ) === 0;
}
