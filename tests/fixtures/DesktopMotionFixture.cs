using System;
using System.Diagnostics;
using System.Drawing;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

// A slow target on a separate GUI thread exposes the async position backlog
// hidden by the same-thread cursor regression. No real user window is touched.
class DesktopMotionFixture : Form {
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int left, top, right, bottom; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  static readonly BindingFlags Private = BindingFlags.Static | BindingFlags.NonPublic;
  static readonly Type Host = typeof(DesktopHost);
  static readonly ManualResetEvent ready = new ManualResetEvent(false), entered = new ManualResetEvent(false), release = new ManualResetEvent(false);
  static DesktopMotionFixture form;
  static IntPtr target;
  static volatile bool slow;
  static int updates;
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x46 && slow) {
      Interlocked.Increment(ref updates);
      entered.Set();
      release.WaitOne(3000);
      Thread.Sleep(12);
    }
    base.WndProc(ref m);
  }
  static void Set(string name, object value) { Host.GetField(name, Private).SetValue(null, value); }
  static object Struct(string name, params int[] values) {
    var type = Host.GetNestedType(name, BindingFlags.NonPublic); var value = Activator.CreateInstance(type);
    var fields = name == "POINT" ? new [] { "x", "y" } : new [] { "left", "top", "right", "bottom" };
    for (int i=0; i<values.Length; i++) type.GetField(fields[i]).SetValue(value, values[i]);
    return value;
  }
  static void Update(int x, int y) { Host.GetMethod("UpdateDraggedWindow", Private).Invoke(null, new [] { Struct("POINT", x, y) }); }
  static void EndGesture(bool resize, int x, int y) {
    var type = Host.GetNestedType("MOUSE", BindingFlags.NonPublic); var packet = Activator.CreateInstance(type);
    type.GetField("pt").SetValue(packet, Struct("POINT", x, y));
    var data = Marshal.AllocHGlobal(Marshal.SizeOf(type));
    try {
      Marshal.StructureToPtr(packet, data, false);
      var result = (IntPtr)Host.GetMethod("Mouse", Private).Invoke(null, new object[] { 0, new IntPtr(resize ? 0x205 : 0x202), data });
      if (result == IntPtr.Zero || (IntPtr)Host.GetField("dragged", Private).GetValue(null) != IntPtr.Zero) throw new Exception("Release did not finish the gesture");
    } finally { Marshal.FreeHGlobal(data); }
  }
  static void Verify(bool resize) {
    RECT before; GetWindowRect(target, out before);
    Set("dragged", target); Set("original", Struct("RECT", before.left, before.top, before.right, before.bottom));
    Set("start", Struct("POINT", 0, 0)); Set("resizing", resize); Set("fromLeft", false); Set("fromTop", false);
    updates = 0; entered.Reset(); release.Reset(); slow = true;
    try {
      Update(1, 1);
      if (!entered.WaitOne(1000)) throw new Exception("Target did not receive first position update");
      var input = Stopwatch.StartNew();
      // Mouse polling can run much faster than the target can resize/repaint.
      for (int i=2; i<=200; i++) Update(i, i / 2);
      EndGesture(resize, 201, 100); // Release position must survive coalescing too.
      input.Stop();
      if (input.ElapsedMilliseconds > 250) throw new Exception("Slow target blocked input handling: " + input.ElapsedMilliseconds + "ms");
      release.Set();
      var settle = Stopwatch.StartNew(); bool reached = false;
      while (settle.ElapsedMilliseconds < 700) {
        RECT after; GetWindowRect(target, out after);
        reached = resize
          ? after.right - after.left == before.right - before.left + 201 && after.bottom - after.top == before.bottom - before.top + 100
          : after.left == before.left + 201 && after.top == before.top + 100;
        if (reached) break;
        Thread.Sleep(5);
      }
      if (!reached || updates > 3) throw new Exception((resize ? "Resize" : "Move") + " replays obsolete positions: " + updates + " target updates, latest reached=" + reached + " after " + settle.ElapsedMilliseconds + "ms");
      Console.WriteLine("PASS: " + (resize ? "resize" : "move") + ": 201 input positions coalesced to " + updates + " target updates, latest reached in " + settle.ElapsedMilliseconds + "ms; input took " + input.ElapsedMilliseconds + "ms");
    } finally { slow = false; release.Set(); }
  }
  [STAThread] static int Main() {
    SetProcessDPIAware();
    var ui = new Thread(delegate() {
      form = new DesktopMotionFixture { Text="DevToolkit motion backlog regression", StartPosition=FormStartPosition.Manual, Location=new Point(-20000,-20000), Size=new Size(400,300), ShowInTaskbar=false };
      form.Shown += delegate { target = form.Handle; ready.Set(); };
      Application.Run(form); form.Dispose();
    });
    ui.SetApartmentState(ApartmentState.STA); ui.IsBackground = true; ui.Start();
    if (!ready.WaitOne(3000)) throw new Exception("Test window did not start");
    try { Verify(false); Verify(true); return 0; }
    catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    finally { slow = false; release.Set(); form.BeginInvoke((Action)(() => form.Close())); ui.Join(3000); }
  }
}
