using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

class Launcher
{
    // ── Native methods ──────────────────────────────────────────────
    static class NativeMethods
    {
        public static readonly IntPtr HWND_BROADCAST = new IntPtr(0xffff);
        public const int WM_SETTINGCHANGE = 0x001A;
        public const int SMTO_ABORTIFHUNG = 0x0002;

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern IntPtr SendMessageTimeout(
            IntPtr hWnd, uint Msg, IntPtr wParam, string lParam,
            uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
    }

    // ── Constants ───────────────────────────────────────────────────
    const string APP_NAME = "奇计";
    const string APP_VERSION = "0.17.0";
    static readonly Color BRAND_COLOR = Color.FromArgb(88, 101, 242);
    static readonly Color BG_COLOR = Color.FromArgb(30, 30, 35);
    static readonly Color CARD_COLOR = Color.FromArgb(40, 40, 48);
    static readonly Color TEXT_PRIMARY = Color.FromArgb(235, 235, 240);
    static readonly Color TEXT_SECONDARY = Color.FromArgb(160, 160, 170);

    // ── Install state ───────────────────────────────────────────────
    static string s_exePath = Assembly.GetExecutingAssembly().Location;
    static string s_tempDir;
    static string s_sevenZipPath;
    static string s_installDir;

    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        // 提取内嵌 7zr.exe 到临时目录
        PrepSevenZip();

        // 启动向导
        Application.Run(new WizardForm());
    }

    // ─────────────────────────────────────────────────────────────────
    //  7z 准备
    // ─────────────────────────────────────────────────────────────────
    static void PrepSevenZip()
    {
        s_tempDir = Path.Combine(Path.GetTempPath(), "QijiSetup_" + Guid.NewGuid().ToString("N").Substring(0, 8));
        Directory.CreateDirectory(s_tempDir);
        s_sevenZipPath = Path.Combine(s_tempDir, "7zr.exe");

        var asm = Assembly.GetExecutingAssembly();
        foreach (var name in asm.GetManifestResourceNames())
        {
            if (name.EndsWith("7zr.exe"))
            {
                using (var stream = asm.GetManifestResourceStream(name))
                using (var outFs = File.Create(s_sevenZipPath))
                {
                    stream.CopyTo(outFs);
                }
                return;
            }
        }
        MessageBox.Show("内部错误: 未找到 7zr.exe 资源", APP_NAME + " 安装", MessageBoxButtons.OK, MessageBoxIcon.Error);
        Environment.Exit(1);
    }

    // ─────────────────────────────────────────────────────────────────
    //  安装逻辑（在后台线程跑）
    // ─────────────────────────────────────────────────────────────────
    static void PerformInstall(string installDir, InstallProgressReporter reporter)
    {
        s_installDir = installDir;
        Directory.CreateDirectory(installDir);

        // 1. Defender 排除
        reporter(0, "正在配置 Windows Defender...");
        AddDefenderExclusion(installDir);
        AddDefenderExclusion(s_tempDir);

        // 2. 7z 解压（解析进度）
        reporter(5, "正在解压文件...");
        int exitCode = ExtractWithProgress(s_exePath, installDir, percent =>
        {
            // 7z 进度映射到 5%–85%
            int mapped = 5 + (int)(percent * 0.80);
            reporter(mapped, "正在解压文件... " + percent + "%");
        });

        if (exitCode != 0)
        {
            reporter(-1, "解压失败 (代码 " + exitCode + ")");
            return;
        }

        // 3. 清理临时
        reporter(86, "正在清理临时文件...");
        try { Directory.Delete(s_tempDir, true); } catch { }

        // 4. 查找 app exe
        string appExe = Path.Combine(installDir, "Qiji.exe");
        if (!File.Exists(appExe))
        {
            var found = Directory.GetFiles(installDir, "Qiji.exe", SearchOption.AllDirectories);
            if (found.Length > 0) appExe = found[0];
            else { reporter(-1, "错误: 解压后未找到 Qiji.exe"); return; }
        }
        string appDir = Path.GetDirectoryName(appExe);

        // 5. 安装 uninstall.exe
        reporter(88, "正在安装卸载程序...");
        var asm = Assembly.GetExecutingAssembly();
        foreach (var name in asm.GetManifestResourceNames())
        {
            if (name.EndsWith("uninstall.exe"))
            {
                using (var stream = asm.GetManifestResourceStream(name))
                using (var outFs = File.Create(Path.Combine(appDir, "uninstall.exe")))
                {
                    stream.CopyTo(outFs);
                }
                break;
            }
        }

        // 6. 快捷方式
        reporter(90, "正在创建快捷方式...");
        CreateShortcut(
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), APP_NAME + ".lnk"),
            appExe, appDir);

        string startMenu = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Programs), APP_NAME);
        Directory.CreateDirectory(startMenu);
        CreateShortcut(
            Path.Combine(startMenu, APP_NAME + ".lnk"),
            appExe, appDir);

        // 7. 注册卸载信息
        reporter(93, "正在注册系统信息...");
        using (var key = Registry.CurrentUser.CreateSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Qiji"))
        {
            key.SetValue("DisplayName", APP_NAME);
            key.SetValue("DisplayIcon", appExe + ", 0");
            key.SetValue("UninstallString", Path.Combine(appDir, "uninstall.exe"));
            key.SetValue("InstallLocation", appDir);
            key.SetValue("DisplayVersion", APP_VERSION);
            key.SetValue("Publisher", APP_NAME);
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }

        // 8. 初始化数据目录
        reporter(96, "正在初始化数据目录...");
        string qijiHome = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "qiji");
        Directory.CreateDirectory(qijiHome);

        Registry.SetValue(@"HKEY_CURRENT_USER\Environment", "QIJI_HOME", qijiHome);

        try
        {
            using (var envKey = Registry.CurrentUser.OpenSubKey(@"Environment", true))
            {
                if (envKey != null && envKey.GetValue("HERMES_HOME") != null)
                    envKey.DeleteValue("HERMES_HOME", false);
            }
        }
        catch { }

        IntPtr result;
        NativeMethods.SendMessageTimeout(
            NativeMethods.HWND_BROADCAST, NativeMethods.WM_SETTINGCHANGE,
            IntPtr.Zero, "Environment",
            NativeMethods.SMTO_ABORTIFHUNG, 5000, out result);

        string configPath = Path.Combine(qijiHome, "config.yaml");
        if (!File.Exists(configPath))
        {
            File.WriteAllText(configPath, "display:\n  language: zh\n", System.Text.Encoding.UTF8);
        }

        reporter(100, "安装完成!");
    }

    static void LaunchApp(string installDir)
    {
        string appExe = Path.Combine(installDir, "Qiji.exe");
        if (!File.Exists(appExe))
        {
            var found = Directory.GetFiles(installDir, "Qiji.exe", SearchOption.AllDirectories);
            if (found.Length > 0) appExe = found[0];
        }
        if (File.Exists(appExe))
        {
            var psi = new ProcessStartInfo
            {
                FileName = appExe,
                WorkingDirectory = Path.GetDirectoryName(appExe),
                UseShellExecute = true
            };
            Process.Start(psi);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  7z 进度解析
    // ─────────────────────────────────────────────────────────────────
    static int ExtractWithProgress(string archivePath, string destDir, Action<int> onProgress)
    {
        var psi = new ProcessStartInfo
        {
            FileName = s_sevenZipPath,
            Arguments = "x \"" + archivePath + "\" -o\"" + destDir + "\" -y -mmt=on -bsp1",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            StandardOutputEncoding = System.Text.Encoding.GetEncoding("GB2312")
        };

        var proc = new Process { StartInfo = psi, EnableRaisingEvents = true };
        proc.Start();

        // 实时读取 stdout 解析百分比
        // 7z -bsp1 输出格式: "  45% 12 - some/file.ext"
        string line;
        while ((line = proc.StandardOutput.ReadLine()) != null)
        {
            line = line.Trim();
            if (line.Length > 0 && line[0] >= '0' && line[0] <= '9')
            {
                int pct = 0;
                int spaceIdx = line.IndexOf('%');
                if (spaceIdx > 0 && int.TryParse(line.Substring(0, spaceIdx).Trim(), out pct))
                {
                    onProgress(pct);
                }
            }
        }
        proc.WaitForExit();
        return proc.ExitCode;
    }

    static void AddDefenderExclusion(string path)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -NonInteractive -Command \"Add-MpPreference -ExclusionPath '" + path + "' -ErrorAction SilentlyContinue\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true
            };
            var p = Process.Start(psi);
            p.StandardInput.Close();
            p.WaitForExit(10000);
        }
        catch { }
    }

    static void CreateShortcut(string shortcutPath, string targetPath, string workingDir)
    {
        Type t = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(t);
        object shortcut = t.InvokeMember("CreateShortcut",
            BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
        Type st = shortcut.GetType();
        st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
        st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDir });
        st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath + ", 0" });
        st.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { APP_NAME });
        st.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
    }

    // ─────────────────────────────────────────────────────────────────
    //  进度回调委托
    // ─────────────────────────────────────────────────────────────────
    delegate void InstallProgressReporter(int percent, string status);

    // ═════════════════════════════════════════════════════════════════
    //  向导主窗体
    // ═════════════════════════════════════════════════════════════════
    class WizardForm : Form
    {
        // 4 个页面面板
        Panel _welcomePage, _dirPage, _installPage, _donePage;
        Button _btnNext, _btnBack, _btnCancel;
        int _currentPage = 0;

        // 目录选择
        TextBox _dirTextBox;

        // 安装进度
        ProgressBar _progressBar;
        Label _progressLabel;
        Label _statusLabel;
        bool _installFailed = false;

        // 完成页
        CheckBox _chkLaunch;
        CheckBox _chkDesktop;

        public WizardForm()
        {
            SetupWindow();
            BuildWelcomePage();
            BuildDirPage();
            BuildInstallPage();
            BuildDonePage();
            BuildButtons();
            ShowPage(0);
        }

        void SetupWindow()
        {
            Text = APP_NAME + " 安装程序";
            Size = new Size(520, 400);
            MinimumSize = new Size(520, 400);
            MaximumSize = new Size(520, 400);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = BG_COLOR;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            MinimizeBox = false;

            // 图标 (用默认，因为没有 ico 资源)
            try { Icon = SystemIcons.Application; } catch { }
        }

        // ── 欢迎页 ──────────────────────────────────────────────
        void BuildWelcomePage()
        {
            _welcomePage = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = BG_COLOR,
                Padding = new Padding(40)
            };

            var title = new Label
            {
                Text = APP_NAME,
                Font = new Font("Microsoft YaHei", 28, FontStyle.Bold),
                ForeColor = TEXT_PRIMARY,
                AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Height = 60
            };

            var logoBox = new Panel
            {
                Dock = DockStyle.Top,
                Height = 80,
                BackColor = CARD_COLOR
            };
            logoBox.Paint += (s, e) =>
            {
                var g = e.Graphics;
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                int sz = 48;
                int x = (logoBox.Width - sz) / 2;
                int y = (logoBox.Height - sz) / 2;
                using (var brush = new SolidBrush(BRAND_COLOR))
                {
                    g.FillRectangle(brush, x, y, sz, sz);
                }
                var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                g.DrawString("奇", new Font("Microsoft YaHei", 20, FontStyle.Bold), Brushes.White, new RectangleF(x, y, sz, sz), sf);
            };

            var subtitle = new Label
            {
                Text = "版本 " + APP_VERSION,
                Font = new Font("Microsoft YaHei", 11),
                ForeColor = TEXT_SECONDARY,
                AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Height = 30
            };

            var desc = new Label
            {
                Text = "\n\n本向导将引导您完成" + APP_NAME + "的安装。\n\n请关闭其他正在运行的程序，\n然后点击「下一步」继续。",
                Font = new Font("Microsoft YaHei", 10),
                ForeColor = TEXT_SECONDARY,
                AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Fill
            };

            // 从下到上添加
            _welcomePage.Controls.Add(desc);
            _welcomePage.Controls.Add(subtitle);
            _welcomePage.Controls.Add(logoBox);
            _welcomePage.Controls.Add(title);
        }

        // ── 目录选择页 ──────────────────────────────────────────
        void BuildDirPage()
        {
            _dirPage = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = BG_COLOR,
                Padding = new Padding(40, 30, 40, 40)
            };

            var title = new Label
            {
                Text = "选择安装位置",
                Font = new Font("Microsoft YaHei", 16, FontStyle.Bold),
                ForeColor = TEXT_PRIMARY,
                AutoSize = false,
                Dock = DockStyle.Top,
                Height = 40
            };

            var hint = new Label
            {
                Text = APP_NAME + " 将安装到以下目录。点击「安装」开始。",
                Font = new Font("Microsoft YaHei", 9),
                ForeColor = TEXT_SECONDARY,
                AutoSize = false,
                Dock = DockStyle.Top,
                Height = 30
            };

            // 路径输入框
            string defaultPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs", "Qiji");

            _dirTextBox = new TextBox
            {
                Text = defaultPath,
                Font = new Font("Consolas", 10),
                BackColor = CARD_COLOR,
                ForeColor = TEXT_PRIMARY,
                BorderStyle = BorderStyle.FixedSingle,
                Dock = DockStyle.Top,
                Height = 32
            };

            var browseBtn = new Button
            {
                Text = "浏览...",
                Font = new Font("Microsoft YaHei", 9),
                BackColor = CARD_COLOR,
                ForeColor = TEXT_PRIMARY,
                FlatStyle = FlatStyle.Flat,
                Dock = DockStyle.Top,
                Height = 30,
                TextAlign = ContentAlignment.MiddleCenter
            };
            browseBtn.FlatAppearance.BorderColor = TEXT_SECONDARY;
            browseBtn.Click += (s, e) =>
            {
                var dlg = new FolderBrowserDialog
                {
                    Description = "选择" + APP_NAME + "安装目录",
                    SelectedPath = _dirTextBox.Text
                };
                if (dlg.ShowDialog() == DialogResult.OK)
                    _dirTextBox.Text = dlg.SelectedPath;
            };

            // 用一个间距 panel
            var spacer1 = new Panel { Dock = DockStyle.Top, Height = 15 };
            var spacer2 = new Panel { Dock = DockStyle.Top, Height = 10 };

            _dirPage.Controls.Add(spacer2);
            _dirPage.Controls.Add(browseBtn);
            _dirPage.Controls.Add(_dirTextBox);
            _dirPage.Controls.Add(spacer1);
            _dirPage.Controls.Add(hint);
            _dirPage.Controls.Add(title);
        }

        // ── 安装进度页 ──────────────────────────────────────────
        void BuildInstallPage()
        {
            _installPage = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = BG_COLOR,
                Padding = new Padding(40, 30, 40, 40)
            };

            var title = new Label
            {
                Text = "正在安装",
                Font = new Font("Microsoft YaHei", 16, FontStyle.Bold),
                ForeColor = TEXT_PRIMARY,
                AutoSize = false,
                Dock = DockStyle.Top,
                Height = 40
            };

            _statusLabel = new Label
            {
                Text = "准备中...",
                Font = new Font("Microsoft YaHei", 10),
                ForeColor = TEXT_SECONDARY,
                AutoSize = false,
                Dock = DockStyle.Top,
                Height = 25
            };

            var progSpacer = new Panel { Dock = DockStyle.Top, Height = 10 };

            _progressBar = new ProgressBar
            {
                Minimum = 0,
                Maximum = 100,
                Value = 0,
                Height = 24,
                Dock = DockStyle.Top,
                Style = ProgressBarStyle.Continuous
            };

            _progressLabel = new Label
            {
                Text = "0%",
                Font = new Font("Microsoft YaHei", 10),
                ForeColor = TEXT_PRIMARY,
                AutoSize = false,
                Dock = DockStyle.Top,
                Height = 25,
                TextAlign = ContentAlignment.MiddleCenter
            };

            _installPage.Controls.Add(_progressLabel);
            _installPage.Controls.Add(progSpacer);
            _installPage.Controls.Add(_progressBar);
            _installPage.Controls.Add(_statusLabel);
            _installPage.Controls.Add(title);
        }

        // ── 完成页 ──────────────────────────────────────────────
        void BuildDonePage()
        {
            _donePage = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = BG_COLOR,
                Padding = new Padding(40, 30, 40, 40)
            };

            var title = new Label
            {
                Text = "安装完成!",
                Font = new Font("Microsoft YaHei", 20, FontStyle.Bold),
                ForeColor = Color.FromArgb(80, 200, 120),
                AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Height = 50
            };

            var checkPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 80,
                BackColor = BG_COLOR,
                Padding = new Padding(60, 20, 60, 0)
            };

            _chkLaunch = new CheckBox
            {
                Text = "立即启动 " + APP_NAME,
                Font = new Font("Microsoft YaHei", 10),
                ForeColor = TEXT_PRIMARY,
                Checked = true,
                Dock = DockStyle.Top,
                Height = 30,
                BackColor = BG_COLOR
            };

            _chkDesktop = new CheckBox
            {
                Text = "查看安装目录",
                Font = new Font("Microsoft YaHei", 10),
                ForeColor = TEXT_PRIMARY,
                Checked = false,
                Dock = DockStyle.Top,
                Height = 30,
                BackColor = BG_COLOR
            };

            checkPanel.Controls.Add(_chkDesktop);
            checkPanel.Controls.Add(_chkLaunch);

            _donePage.Controls.Add(checkPanel);
            _donePage.Controls.Add(title);
        }

        // ── 底部按钮 ────────────────────────────────────────────
        void BuildButtons()
        {
            var btnPanel = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 50,
                BackColor = Color.FromArgb(25, 25, 30),
                Padding = new Padding(20, 10, 20, 10)
            };

            _btnCancel = new Button
            {
                Text = "取消",
                Size = new Size(80, 32),
                FlatStyle = FlatStyle.Flat,
                BackColor = CARD_COLOR,
                ForeColor = TEXT_SECONDARY,
                Font = new Font("Microsoft YaHei", 9)
            };
            _btnCancel.FlatAppearance.BorderColor = TEXT_SECONDARY;
            _btnCancel.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            _btnCancel.Location = new Point(btnPanel.Width - 100, 9);
            _btnCancel.Click += (s, e) =>
            {
                if (_currentPage == 2)
                {
                    // 安装中不允许取消
                    MessageBox.Show("安装进行中，请稍候...", APP_NAME, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                Application.Exit();
            };

            _btnBack = new Button
            {
                Text = "上一步",
                Size = new Size(80, 32),
                FlatStyle = FlatStyle.Flat,
                BackColor = CARD_COLOR,
                ForeColor = TEXT_PRIMARY,
                Font = new Font("Microsoft YaHei", 9)
            };
            _btnBack.FlatAppearance.BorderColor = TEXT_SECONDARY;
            _btnBack.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            _btnBack.Location = new Point(btnPanel.Width - 280, 9);
            _btnBack.Click += (s, e) => ShowPage(_currentPage - 1);

            _btnNext = new Button
            {
                Text = "下一步",
                Size = new Size(80, 32),
                FlatStyle = FlatStyle.Flat,
                BackColor = BRAND_COLOR,
                ForeColor = Color.White,
                Font = new Font("Microsoft YaHei", 9, FontStyle.Bold)
            };
            _btnNext.FlatAppearance.BorderColor = BRAND_COLOR;
            _btnNext.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            _btnNext.Location = new Point(btnPanel.Width - 190, 9);
            _btnNext.Click += (s, e) => OnNextClick();

            btnPanel.Controls.AddRange(new Control[] { _btnCancel, _btnBack, _btnNext });

            // 处理 DPI 缩放后的位置
            btnPanel.Resize += (s, e) =>
            {
                _btnCancel.Location = new Point(btnPanel.Width - 100, 9);
                _btnBack.Location = new Point(btnPanel.Width - 280, 9);
                _btnNext.Location = new Point(btnPanel.Width - 190, 9);
            };

            Controls.Add(btnPanel);
        }

        void OnNextClick()
        {
            if (_currentPage == 0)
            {
                ShowPage(1);
            }
            else if (_currentPage == 1)
            {
                // 开始安装
                string dir = _dirTextBox.Text.Trim();
                if (string.IsNullOrEmpty(dir))
                {
                    MessageBox.Show("请选择安装目录", APP_NAME, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                if (!Directory.Exists(dir))
                {
                    try { Directory.CreateDirectory(dir); }
                    catch (Exception ex)
                    {
                        MessageBox.Show("无法创建目录: " + ex.Message, APP_NAME, MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return;
                    }
                }

                _btnNext.Enabled = false;
                _btnBack.Enabled = false;
                _btnNext.Text = "安装中...";
                ShowPage(2);
                StartInstall(dir);
            }
            else if (_currentPage == 3)
            {
                // 完成
                Application.Exit();
            }
        }

        void StartInstall(string installDir)
        {
            _installFailed = false;

            var thread = new Thread(() =>
            {
                try
                {
                    PerformInstall(installDir, (percent, status) =>
                    {
                        // 回到 UI 线程更新
                        if (IsDisposed) return;
                        BeginInvoke((MethodInvoker)delegate
                        {
                            if (percent < 0)
                            {
                                // 错误
                                _installFailed = true;
                                _statusLabel.Text = status;
                                _statusLabel.ForeColor = Color.FromArgb(220, 80, 80);
                                _progressBar.Style = ProgressBarStyle.Blocks;
                            }
                            else
                            {
                                _progressBar.Value = Math.Min(percent, 100);
                                _progressLabel.Text = percent + "%";
                                _statusLabel.Text = status;
                            }
                        });
                    });

                    if (!_installFailed)
                    {
                        // 安装成功 → 跳到完成页
                        BeginInvoke((MethodInvoker)delegate
                        {
                            ShowPage(3);
                        });
                    }
                    else
                    {
                        BeginInvoke((MethodInvoker)delegate
                        {
                            _btnNext.Enabled = true;
                            _btnNext.Text = "重试";
                            _btnBack.Enabled = true;
                        });
                    }
                }
                catch (Exception ex)
                {
                    BeginInvoke((MethodInvoker)delegate
                    {
                        _statusLabel.Text = "安装出错: " + ex.Message;
                        _statusLabel.ForeColor = Color.FromArgb(220, 80, 80);
                        _btnNext.Enabled = true;
                        _btnNext.Text = "重试";
                        _btnBack.Enabled = true;
                    });
                }
            });
            thread.IsBackground = true;
            thread.Start();
        }

        void ShowPage(int index)
        {
            _currentPage = Math.Max(0, Math.Min(3, index));

            // 隐藏所有
            _welcomePage.Visible = false;
            _dirPage.Visible = false;
            _installPage.Visible = false;
            _donePage.Visible = false;

            // 按钮状态
            _btnBack.Visible = true;
            _btnCancel.Visible = true;

            switch (_currentPage)
            {
                case 0: // 欢迎
                    _welcomePage.Visible = true;
                    _btnBack.Enabled = false;
                    _btnNext.Text = "下一步";
                    _btnNext.Enabled = true;
                    break;

                case 1: // 目录
                    _dirPage.Visible = true;
                    _btnBack.Enabled = true;
                    _btnNext.Text = "安装";
                    _btnNext.Enabled = true;
                    break;

                case 2: // 安装中
                    _installPage.Visible = true;
                    _btnBack.Enabled = false;
                    _btnNext.Enabled = false;
                    _btnNext.Text = "安装中...";
                    _btnCancel.Enabled = false;
                    break;

                case 3: // 完成
                    _donePage.Visible = true;
                    _btnBack.Visible = false;
                    _btnCancel.Visible = false;
                    _btnNext.Text = "完成";
                    _btnNext.Enabled = true;

                    // 处理 checkbox
                    if (_chkLaunch.Checked)
                    {
                        LaunchApp(s_installDir);
                    }
                    break;
            }
        }

        // 窗口关闭时清理
        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (_currentPage == 2 && !_installFailed)
            {
                e.Cancel = true;
                return;
            }
            if (s_tempDir != null && Directory.Exists(s_tempDir))
            {
                try { Directory.Delete(s_tempDir, true); } catch { }
            }
            base.OnFormClosing(e);
        }
    }
}
