using System;
using System.Drawing;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Drive tagged OS mouse packets through the production drag handler.
// Button packets are swallowed; move packets use the production return value so
// GetCursorPos detects cursor freezing. Only an offscreen test form is manipulated.
class DesktopGestureFixture : Form {
  delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int left, top, right, bottom; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSE { public POINT point; public uint data, flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int x, y; public uint data, flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mouse; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION value; }
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Hook callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out RECT rect);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
  static readonly Type Host = typeof(DesktopHost);
  static readonly BindingFlags Private = BindingFlags.Static | BindingFlags.NonPublic;
  static Hook callback = Probe;
  static IntPtr hook;
  static DesktopGestureFixture form;
  static bool resize, sawMove, osButtonDown, sawPress, sawRelease;
  static string callbackError;
  static int stage, result;
  static RECT before;
  static POINT cursorStart, lastPacket, previousCursor, savedCursor;
  static int direction;
  static bool movedCursor;
  static string trace = "";
  protected override bool ShowWithoutActivation { get { return true; } }
  static void Set(string field, object value) { Host.GetField(field, Private).SetValue(null, value); }
  static object Get(string field) { return Host.GetField(field, Private).GetValue(null); }
  static object Struct(string name, params int[] fields) {
    var type = Host.GetNestedType(name, BindingFlags.NonPublic); var value = Activator.CreateInstance(type);
    var names = name == "POINT" ? new [] { "x", "y" } : new [] { "left", "top", "right", "bottom" };
    for (int i=0;i<fields.Length;i++) type.GetField(names[i]).SetValue(value, fields[i]);
    return value;
  }
  static IntPtr Probe(int code, IntPtr message, IntPtr data) {
    if (code < 0) return CallNextHookEx(hook, code, message, data);
    var packet = (MOUSE)Marshal.PtrToStructure(data, typeof(MOUSE));
    if (packet.extra.ToUInt64() != 0x44544b) return CallNextHookEx(hook, code, message, data);
    try {
      int msg = (int)message;
      trace += msg.ToString("x") + ":" + Get("dragged") + " ";
      if (msg == 0x201 || msg == 0x204) {
        sawPress = true;
        // Successful target selection at press time. Subsequent packets run unmodified production logic.
        Set("dragged", form.Handle); Set("start", Struct("POINT", cursorStart.x, cursorStart.y));
        Set("original", Struct("RECT", before.left, before.top, before.right, before.bottom));
        Set("resizing", resize); Set("fromLeft", false); Set("fromTop", false);
      } else {
        if (msg == 0x202 || msg == 0x205) sawRelease = true;
        if (msg == 0x200) { sawMove = true; lastPacket = packet.point; movedCursor = true; osButtonDown = (GetAsyncKeyState(resize ? 2 : 1) & 0x8000) != 0; }
        var handled = (IntPtr)Host.GetMethod("Mouse", Private).Invoke(null, new object[] { code, message, data });
        if (msg == 0x200) return handled;
        if (handled == IntPtr.Zero) throw new Exception("Gesture release was not consumed");
      }
    } catch (Exception error) { callbackError = error.ToString(); }
    return new IntPtr(1); // Never deliver test clicks to a real application.
  }
  static void Begin(bool resizing) {
    resize = resizing; sawMove = false; sawPress = false; sawRelease = false; callbackError = null; trace = "";
    GetWindowRect(form.Handle, out before);
    GetCursorPos(out cursorStart); previousCursor = cursorStart;
    var screen = Screen.FromPoint(new Point(cursorStart.x, cursorStart.y)).Bounds;
    direction = cursorStart.x < screen.Left + screen.Width / 2 ? 1 : -1;
    Packet(resize ? 8u : 2u);
  }
  static void Packet(uint flags) {
    var inputs = new INPUT[1];
    inputs[0].value.mouse = new MOUSEINPUT { x = flags == 1 ? direction * 4 : 0, flags = flags == 1 ? 0x2001u : flags, extra = new UIntPtr(0x44544b) };
    if(SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT))) != 1) throw new Exception("SendInput failed");
  }
  static void VerifyStep() {
    if(callbackError != null) throw new Exception(callbackError);
    if(!sawMove) throw new Exception("No tagged OS move reached the hook; press=" + sawPress + ", release=" + sawRelease);
    POINT cursor; GetCursorPos(out cursor);
    if(cursor.x == previousCursor.x && cursor.y == previousCursor.y) throw new Exception((resize ? "Resize" : "Move") + " froze the system cursor");
    if(cursor.x != lastPacket.x || cursor.y != lastPacket.y) throw new Exception("System cursor did not reach the mouse packet position");
    int dx = cursor.x - cursorStart.x, dy = cursor.y - cursorStart.y;
    RECT after; GetWindowRect(form.Handle, out after);
    bool changed = resize ? after.right - after.left == before.right - before.left + dx && after.bottom - after.top == before.bottom - before.top + dy : after.left == before.left + dx && after.top == before.top + dy;
    if(!changed) throw new Exception((resize ? "Resize" : "Move") + " did not update the test window bounds; OS button down = " + osButtonDown + "; before=" + before.left + "," + before.top + "," + before.right + "," + before.bottom + "; after=" + after.left + "," + after.top + "," + after.right + "," + after.bottom + "; packets=" + trace);
    previousCursor = cursor;
  }
  static void Verify() {
    if(callbackError != null) throw new Exception(callbackError);
    if(!sawPress || !sawRelease || (IntPtr)Get("dragged") != IntPtr.Zero) throw new Exception("Mouse release did not end the gesture");
    Console.WriteLine("PASS: " + (resize ? "resize" : "move") + " continuously moves the system cursor and tracks window bounds; OS button state = " + osButtonDown);
  }
  [STAThread] static int Main() {
    SetProcessDPIAware();
    GetCursorPos(out savedCursor);
    form = new DesktopGestureFixture { Text="DevToolkit gesture regression", StartPosition=FormStartPosition.Manual, Location=new Point(-20000,-20000), Size=new Size(400,300), ShowInTaskbar=false };
    hook = SetWindowsHookEx(14, callback, GetModuleHandle(null), 0);
    if(hook == IntPtr.Zero) throw new Exception("Could not install isolated test hook");
    var timer = new System.Windows.Forms.Timer { Interval=120 };
    timer.Tick += delegate {
      try {
        switch(stage++) {
          case 0: Begin(false); break;
          case 1: Packet(1); break;
          case 2: VerifyStep(); Packet(1); break;
          case 3: VerifyStep(); Packet(4); break;
          case 4: Verify(); Begin(true); break;
          case 5: Packet(1); break;
          case 6: VerifyStep(); Packet(1); break;
          case 7: VerifyStep(); Packet(16); break;
          case 8: Verify(); form.Close(); break;
        }
      } catch(Exception error) { Console.Error.WriteLine(error.Message); result=1; form.Close(); }
    };
    form.Shown += delegate { timer.Start(); };
    try { Application.Run(form); } finally {
      timer.Dispose(); UnhookWindowsHookEx(hook); form.Dispose();
      POINT cursor; GetCursorPos(out cursor);
      // Restore only if the user has not moved the cursor since our last packet.
      if(movedCursor && cursor.x == lastPacket.x && cursor.y == lastPacket.y) SetCursorPos(savedCursor.x, savedCursor.y);
    }
    return result;
  }
}
