using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
class DesktopFixture : Form {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool SetDllDirectory(string path);
  [DllImport("VirtualDesktopAccessor.dll", CallingConvention=CallingConvention.Cdecl)] static extern int GetCurrentDesktopNumber();
  [DllImport("VirtualDesktopAccessor.dll", CallingConvention=CallingConvention.Cdecl)] static extern int GetDesktopCount();
  [DllImport("VirtualDesktopAccessor.dll", CallingConvention=CallingConvention.Cdecl)] static extern int GetWindowDesktopNumber(IntPtr h);
  [DllImport("VirtualDesktopAccessor.dll", CallingConvention=CallingConvention.Cdecl)] static extern int MoveWindowToDesktopNumber(IntPtr h, int desktop);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern long GetWindowLongPtr(IntPtr h, int index);
  protected override bool ShowWithoutActivation { get { return true; } }
  static IntPtr previous;
  [STAThread] static void Main(string[] args) {
    SetDllDirectory(args[0]); previous = GetForegroundWindow();
    var form = new DesktopFixture { Text = "DevToolkit native test fixture", ShowInTaskbar = false, StartPosition = FormStartPosition.Manual, Location = new Point(-20000, -20000), Size = new Size(320,240) };
    // Remove the tool-window style so EnumWindows treats this owned test fixture as a normal window.
    form.ShowInTaskbar = true;
    form.Shown += delegate {
      Console.WriteLine("{\"id\":\"" + form.Handle.ToInt64() + "\",\"desktop\":" + GetWindowDesktopNumber(form.Handle) + "}"); Console.Out.Flush();
      var reader = new Thread(delegate() {
        string line; while ((line = Console.ReadLine()) != null) {
          string copy = line;
          form.BeginInvoke((Action)(() => {
            if (copy == "other") { int count = GetDesktopCount(), current = GetCurrentDesktopNumber(); if(count > 1) MoveWindowToDesktopNumber(form.Handle, (current + 1) % count); }
            if (copy == "quit") { SetForegroundWindow(previous); form.Close(); return; }
            Console.WriteLine("{\"desktop\":" + GetWindowDesktopNumber(form.Handle) + ",\"current\":" + GetCurrentDesktopNumber() + ",\"count\":" + GetDesktopCount() + ",\"topmost\":" + ((GetWindowLongPtr(form.Handle, -20) & 8) != 0 ? "true" : "false") + "}"); Console.Out.Flush();
          }));
        }
        form.BeginInvoke((Action)(() => { SetForegroundWindow(previous); form.Close(); }));
      }); reader.IsBackground = true; reader.Start();
    };
    Application.Run(form); Environment.Exit(0);
  }
}
