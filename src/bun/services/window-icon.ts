import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";

const IMAGE_ICON = 1;
const LR_LOADFROMFILE = 0x0010;
const WM_SETICON = 0x0080;
const ICON_SMALL = 0;
const ICON_BIG = 1;

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
