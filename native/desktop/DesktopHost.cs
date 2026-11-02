using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// A private, line-delimited JSON bridge. No shell execution, key logging or clipboard access.
class DesktopHost {
  static JavaScriptSerializer json = new JavaScriptSerializer();
  static Control dispatcher;
  static int parentPid;
  static bool draggingEnabled, requireShift, switcherEnabled, spaceHeld;
  static bool leftWin, rightWin;
  static IntPtr mouseHook, keyboardHook, dragged;
  static HookProc mouseProc = Mouse, keyboardProc = Keyboard;
  static POINT start;
  static RECT original;
  static bool resizing, fromLeft, fromTop;
  static WindowMotion motion;
  static int minWidth = 240, minHeight = 120, maxWidth = 32767, maxHeight = 32767;
  static bool virtualDesktop;
  static Dictionary<long, uint> listed = new Dictionary<long, uint>();
  delegate IntPtr HookProc(int code, IntPtr w, IntPtr l);
  delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int left, top, right, bottom; }
  [StructLayout(LayoutKind.Sequential)] struct MINMAX { public POINT reserved, maxSize, maxPosition, minTrack, maxTrack; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSE { public POINT pt; public uint data, flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEY { public uint vk, scan, flags, time; public UIntPtr extra; }
  // One in-flight operation and one replaceable latest position per gesture.
  // Synchronous SetWindowPos on this worker prevents a backlog in the target's
  // input queue without blocking the global mouse hook when that target is slow.
  class WindowMotion {
    public readonly IntPtr Window;
    public readonly bool Resize;
    readonly object gate = new object();
    RECT? pending;
    RECT last;
    bool running, cancelled, hasLast;
    public WindowMotion(IntPtr window, bool resize) { Window = window; Resize = resize; }
    public void Cancel() { lock(gate) { cancelled = true; pending = null; } }
    public void Update(int x, int y, int width, int height) {
      var next = new RECT { left = x, top = y, right = x + width, bottom = y + height };
      lock(gate) {
        if (cancelled || hasLast && next.left == last.left && next.top == last.top && next.right == last.right && next.bottom == last.bottom) return;
        pending = last = next; hasLast = true;
        if (running) return;
        running = true;
        ThreadPool.QueueUserWorkItem(delegate { ApplyLatest(); });
      }
    }
    void ApplyLatest() {
      while (true) {
        RECT next;
        lock(gate) {
          if (cancelled || !pending.HasValue) { running = false; return; }
          next = pending.Value; pending = null;
        }
        // A move must not trigger unnecessary resize/layout work in the target.
        uint flags = 0x0014u | (Resize ? 0u : 0x0001u); // NOZORDER | NOACTIVATE | NOSIZE
        if (!IsWindow(Window) || !SetWindowPos(Window, IntPtr.Zero, next.left, next.top, next.right - next.left, next.bottom - next.top, flags)) {
          lock(gate) { cancelled = true; pending = null; running = false; }
          return;
        }
      }
    }
  }
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out RECT rect);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window, int command);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr window);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint message, IntPtr w, ref MINMAX data, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc fn, IntPtr data);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder text, int max);
  [DllImport("user32.dll")] static extern long GetWindowLongPtr(IntPtr h, int index);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint command);
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);
  [DllImport("VirtualDesktopAccessor.dll", CallingConvention=CallingConvention.Cdecl)] static extern int GetCurrentDesktopNumber();
  [DllImport("VirtualDesktopAccessor.dll", CallingConvention=CallingConvention.Cdecl)] static extern int GetWindowDesktopNumber(IntPtr h);
  [DllImport("VirtualDesktopAccessor.dll", CallingConvention=CallingConvention.Cdecl)] static extern int MoveWindowToDesktopNumber(IntPtr h, int desktop);
  [DllImport("VirtualDesktopAccessor.dll", CallingConvention=CallingConvention.Cdecl)] static extern int GoToDesktopNumber(int desktop);
  [DllImport("VirtualDesktopAccessor.dll", CallingConvention=CallingConvention.Cdecl)] static extern int PinWindow(IntPtr window);

  static bool Down(int key) { return (GetAsyncKeyState(key) & 0x8000) != 0; }
  static void Send(object value) { lock(json) { Console.WriteLine(json.Serialize(value)); Console.Out.Flush(); } }
  static string Text(Dictionary<string,object> d, string key) { return d.ContainsKey(key) ? Convert.ToString(d[key]) : ""; }
  static bool Flag(Dictionary<string,object> d, string key) { return d.ContainsKey(key) && d[key] is bool && (bool)d[key]; }
  static void Notify(string name) { ThreadPool.QueueUserWorkItem(delegate { Send(new { eventName = name }); }); }
  static IntPtr Keyboard(int code, IntPtr w, IntPtr l) {
    if (code >= 0) {
      KEY k = (KEY)Marshal.PtrToStructure(l, typeof(KEY));
      bool down = (int)w == 0x100 || (int)w == 0x104;
      if ((k.flags & 0x10) == 0) {
        if (k.vk == 0x5b) leftWin = down;
        if (k.vk == 0x5c) rightWin = down;
        if (k.vk == 0x20 && (spaceHeld || switcherEnabled && (leftWin || rightWin) && !Down(0x11) && !Down(0x12) && !Down(0x10))) {
          if (down && !spaceHeld) { spaceHeld = true; keybd_event(0xe8, 0, 0, UIntPtr.Zero); keybd_event(0xe8, 0, 2, UIntPtr.Zero); Notify("toggle-switcher"); }
          if (!down) spaceHeld = false;
          return new IntPtr(1);
        }
      }
    }
    return CallNextHookEx(keyboardHook, code, w, l);
  }
  static bool Eligible(IntPtr h) {
    if (h == IntPtr.Zero || !IsWindowVisible(h)) return false;
    var cls = new StringBuilder(128); GetClassName(h, cls, cls.Capacity);
    string c = cls.ToString();
    return c != "Progman" && c != "WorkerW" && c != "Shell_TrayWnd" && c != "Shell_SecondaryTrayWnd";
  }
  static void UpdateDraggedWindow(POINT point) {
    int dx = point.x - start.x, dy = point.y - start.y;
    int width = original.right - original.left, height = original.bottom - original.top;
    int x = original.left, y = original.top;
    if (resizing) {
      int nextW = Math.Min(maxWidth, Math.Max(minWidth, width + (fromLeft ? -dx : dx)));
      int nextH = Math.Min(maxHeight, Math.Max(minHeight, height + (fromTop ? -dy : dy)));
      if (fromLeft) x += width - nextW;
      if (fromTop) y += height - nextH;
      width = nextW; height = nextH;
    } else { x += dx; y += dy; }
    if (motion == null || motion.Window != dragged || motion.Resize != resizing) {
      if (motion != null) motion.Cancel();
      motion = new WindowMotion(dragged, resizing);
    }
    motion.Update(x, y, width, height);
  }
  static IntPtr Mouse(int code, IntPtr w, IntPtr l) {
    if (code >= 0) {
      int message = (int)w;
      MOUSE m = (MOUSE)Marshal.PtrToStructure(l, typeof(MOUSE));
      if (dragged != IntPtr.Zero) {
        if (!IsWindow(dragged)) { if (motion != null) motion.Cancel(); motion = null; dragged = IntPtr.Zero; }
        else if (message == 0x202 && !resizing || message == 0x205 && resizing) { UpdateDraggedWindow(m.pt); dragged = IntPtr.Zero; return new IntPtr(1); }
        else if (message == 0x200) {
          // The initiating press is swallowed by this hook, so GetAsyncKeyState
          // may stay false for the entire gesture. Track release packets instead.
          UpdateDraggedWindow(m.pt);
          // Only swallow the gesture's button down/up. Swallowing WM_MOUSEMOVE
          // prevents Windows from advancing the cursor, so subsequent relative
          // movement stays anchored to the press position and the drag stalls.
          return CallNextHookEx(mouseHook, code, w, l);
        }
      } else if (draggingEnabled && (message == 0x201 || message == 0x204) && Down(0x12) && (!requireShift || Down(0x10)) && !Down(0x11) && !Down(0x5b) && !Down(0x5c)) {
        IntPtr target = GetAncestor(WindowFromPoint(m.pt), 2);
        // Maximized/fullscreen and fixed-size windows retain their native behavior.
        if (Eligible(target) && !IsZoomed(target) && (GetWindowLongPtr(target, -16) & 0x00c00000) != 0 && (message != 0x204 || (GetWindowLongPtr(target, -16) & 0x40000) != 0) && GetWindowRect(target, out original)) {
          if (motion != null) motion.Cancel();
          motion = null;
          dragged = target; start = m.pt; resizing = message == 0x204;
          if (resizing) {
            var limits = new MINMAX(); IntPtr result;
            minWidth = 240; minHeight = 120; maxWidth = 32767; maxHeight = 32767;
            if (SendMessageTimeout(target, 0x24, IntPtr.Zero, ref limits, 3, 25, out result) != IntPtr.Zero) {
              minWidth = Math.Max(80, limits.minTrack.x); minHeight = Math.Max(60, limits.minTrack.y);
              if (limits.maxTrack.x > 0) maxWidth = Math.Max(minWidth, limits.maxTrack.x);
              if (limits.maxTrack.y > 0) maxHeight = Math.Max(minHeight, limits.maxTrack.y);
            }
          }
          keybd_event(0xe8, 0, 0, UIntPtr.Zero); keybd_event(0xe8, 0, 2, UIntPtr.Zero);
          fromLeft = m.pt.x < (original.left + original.right) / 2; fromTop = m.pt.y < (original.top + original.bottom) / 2;
          return new IntPtr(1);
        }
      }
    }
    return CallNextHookEx(mouseHook, code, w, l);
  }
  static object Configure(Dictionary<string,object> d) {
    draggingEnabled = Flag(d, "dragEnabled"); requireShift = Text(d, "modifier") == "alt-shift"; switcherEnabled = Flag(d, "switcherEnabled");
    dragged = IntPtr.Zero;
    if (motion != null) motion.Cancel(); motion = null;
    if (draggingEnabled && mouseHook == IntPtr.Zero) mouseHook = SetWindowsHookEx(14, mouseProc, GetModuleHandle(null), 0);
    if (!draggingEnabled && mouseHook != IntPtr.Zero) { UnhookWindowsHookEx(mouseHook); mouseHook = IntPtr.Zero; }
    if (switcherEnabled && keyboardHook == IntPtr.Zero) { leftWin = Down(0x5b); rightWin = Down(0x5c); keyboardHook = SetWindowsHookEx(13, keyboardProc, GetModuleHandle(null), 0); }
    if (!switcherEnabled && keyboardHook != IntPtr.Zero) { UnhookWindowsHookEx(keyboardHook); keyboardHook = IntPtr.Zero; spaceHeld = false; }
    if (draggingEnabled && mouseHook == IntPtr.Zero || switcherEnabled && keyboardHook == IntPtr.Zero) throw new Exception("Windows refused to install the desktop shortcut hook.");
    return new { dragActive = mouseHook != IntPtr.Zero, switcherActive = keyboardHook != IntPtr.Zero, virtualDesktop = virtualDesktop };
  }
  static object ListWindows() {
    var result = new List<object>(); listed.Clear();
    int current = virtualDesktop ? GetCurrentDesktopNumber() : -1;
    EnumWindows(delegate(IntPtr h, IntPtr data) {
      if (!Eligible(h) || (GetWindowLongPtr(h, -20) & 0x80) != 0 || GetWindow(h, 4) != IntPtr.Zero) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == parentPid || pid == Process.GetCurrentProcess().Id) return true;
      var title = new StringBuilder(1024); GetWindowText(h, title, title.Capacity);
      if (title.Length == 0) return true;
      int cloak; DwmGetWindowAttribute(h, 14, out cloak, 4);
      if ((cloak & 1) != 0 || !virtualDesktop && cloak != 0) return true;
      string process = "Window";
      try { using (var p = Process.GetProcessById((int)pid)) process = p.ProcessName; } catch {}
      int desktop = virtualDesktop ? GetWindowDesktopNumber(h) : -1;
      listed[h.ToInt64()] = pid;
      result.Add(new { id = h.ToInt64().ToString(), pid = pid, title = title.ToString(), app = process, desktop = desktop, current = desktop < 0 || desktop == current, minimized = IsIconic(h) });
      return true;
    }, IntPtr.Zero);
    return result;
  }
  static object Activate(Dictionary<string,object> d) {
    long id; if (!long.TryParse(Text(d, "windowId"), out id) || !listed.ContainsKey(id)) throw new Exception("Refresh the window list before switching.");
    IntPtr h = new IntPtr(id); uint pid; GetWindowThreadProcessId(h, out pid);
    if (!IsWindow(h) || pid != listed[id]) throw new Exception("This window has closed.");
    bool bring = Flag(d, "bring");
    if (bring && !virtualDesktop) throw new Exception("Moving between desktops is unavailable on this Windows build.");
    if (virtualDesktop) {
      int current = GetCurrentDesktopNumber(), target = GetWindowDesktopNumber(h);
      if (current < 0) throw new Exception("Windows virtual desktop service is unavailable.");
      if (bring && target != current && MoveWindowToDesktopNumber(h, current) < 0) throw new Exception("Windows could not move this window to the current desktop.");
      if (!bring && target >= 0 && target != current && GoToDesktopNumber(target) < 0) throw new Exception("Windows could not switch desktops.");
    }
    FocusWindow(h);
    return new { activated = true };
  }
  static void FocusWindow(IntPtr h) {
    if (IsIconic(h)) ShowWindowAsync(h, 9);
    // Explorer uncloaks a moved/restored window asynchronously.
    for (int attempt = 0; attempt < 20; attempt++) {
      int cloak; DwmGetWindowAttribute(h, 14, out cloak, 4);
      if (cloak == 0 && !IsIconic(h)) break;
      Thread.Sleep(15);
    }
    // Mask an otherwise bare modifier and satisfy Windows foreground activation rules.
    keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
    if (!SetForegroundWindow(h) && GetForegroundWindow() != h) {
      uint unused, thread = GetCurrentThreadId(), foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out unused), targetThread = GetWindowThreadProcessId(h, out unused);
      bool attachForeground = foregroundThread != 0 && foregroundThread != thread && AttachThreadInput(thread, foregroundThread, true);
      bool attachTarget = targetThread != thread && targetThread != foregroundThread && AttachThreadInput(thread, targetThread, true);
      try { BringWindowToTop(h); SetForegroundWindow(h); }
      finally { if(attachTarget) AttachThreadInput(thread, targetThread, false); if(attachForeground) AttachThreadInput(thread, foregroundThread, false); }
      if (GetForegroundWindow() != h) throw new Exception("Windows refused focus. The target may require administrator privileges.");
    }
  }
  static object Surface(Dictionary<string,object> d) {
    long id; if (!long.TryParse(Text(d, "windowId"), out id)) throw new Exception("Invalid surface");
    IntPtr h = new IntPtr(id); uint pid; GetWindowThreadProcessId(h, out pid);
    if (!IsWindow(h) || pid != parentPid) throw new Exception("Only DevToolkit surfaces can be pinned");
    bool pinned = false;
    if (virtualDesktop) {
      int current = GetCurrentDesktopNumber();
      if (current >= 0) { MoveWindowToDesktopNumber(h, current); pinned = PinWindow(h) >= 0; }
    }
    if (Flag(d, "focus") && IsWindowVisible(h)) FocusWindow(h);
    SetWindowPos(h, new IntPtr(-1), 0, 0, 0, 0, 0x0013); // TOPMOST | NOMOVE | NOSIZE | NOACTIVATE
    return new { pinned = pinned };
  }
  static void Handle(string line) {
    object id = null;
    try {
      var d = json.Deserialize<Dictionary<string,object>>(line); id = d["id"];
      object result;
      switch(Text(d, "command")) {
        case "configure": result = Configure(d); break;
        case "list": result = ListWindows(); break;
        case "activate": result = Activate(d); break;
        case "surface": result = Surface(d); break;
        case "status": result = new { virtualDesktop = virtualDesktop, dragActive = mouseHook != IntPtr.Zero, switcherActive = keyboardHook != IntPtr.Zero }; break;
        case "quit": Application.ExitThread(); return;
        default: throw new Exception("Unknown desktop command");
      }
      Send(new { id = id, result = result });
    } catch(Exception ex) { Send(new { id = id, error = ex.Message }); }
  }
  [STAThread] static void Main(string[] args) {
    Console.InputEncoding = new UTF8Encoding(false); Console.OutputEncoding = new UTF8Encoding(false);
    parentPid = args.Length > 0 ? int.Parse(args[0]) : 0;
    SetProcessDPIAware(); dispatcher = new Control(); var handle = dispatcher.Handle;
    try { virtualDesktop = GetCurrentDesktopNumber() >= 0; } catch { virtualDesktop = false; }
    var reader = new Thread(delegate() {
      string line; while ((line = Console.ReadLine()) != null) { string copy = line; dispatcher.BeginInvoke((Action)(() => Handle(copy))); }
      dispatcher.BeginInvoke((Action)(() => Application.ExitThread()));
    }); reader.IsBackground = true; reader.Start();
    var timer = new System.Windows.Forms.Timer(); timer.Interval = 2000;
    timer.Tick += delegate { if (parentPid != 0) { try { using(var p = Process.GetProcessById(parentPid)) if(p.HasExited) Application.ExitThread(); } catch { Application.ExitThread(); } } };
    timer.Start(); Send(new { eventName = "ready", virtualDesktop = virtualDesktop });
    Application.Run();
    if (mouseHook != IntPtr.Zero) UnhookWindowsHookEx(mouseHook);
    if (keyboardHook != IntPtr.Zero) UnhookWindowsHookEx(keyboardHook);
    timer.Dispose(); dispatcher.Dispose();
    Environment.Exit(0);
  }
}
