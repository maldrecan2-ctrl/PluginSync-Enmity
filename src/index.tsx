import { Plugin, registerPlugin, getPlugins } from 'enmity/managers/plugins';
import { getByProps } from 'enmity/metro';
import { React, Toasts, Clipboard } from 'enmity/metro/common';
import { create } from 'enmity/patcher';
import { FormRow, FormSection, TextInput, View } from 'enmity/components';
import { get, set } from 'enmity/api/settings';
import manifest from '../manifest.json';

const Patcher = create('PluginSync');
const ID = 'PluginSync';

// Settings helpers
const s = {
    urls: (): Record<string, string> => { try { return JSON.parse(get(ID, 'urls', '{}') || '{}'); } catch { return {}; } },
    setUrls: (d: Record<string, string>) => { try { set(ID, 'urls', JSON.stringify(d)); } catch {} },
    token: (): string => get(ID, 'ghToken', '') as string,
    gistId: (): string => get(ID, 'gistId', '') as string,
};

// GitHub Gist API
const GIST_FILENAME = 'pluginsync.json';
const gistHeaders = (token: string) => ({
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'PluginSync-Enmity',
});

const gistSave = (token: string, gistId: string, data: string): Promise<string> => {
    if (gistId) {
        return fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: gistHeaders(token),
            body: JSON.stringify({ files: { [GIST_FILENAME]: { content: data } } }),
        }).then((r: any) => r.json()).then((r: any) => r.id ?? gistId);
    }
    return fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: gistHeaders(token),
        body: JSON.stringify({
            description: 'PluginSync Enmity Backup',
            public: false,
            files: { [GIST_FILENAME]: { content: data } },
        }),
    }).then((r: any) => r.json()).then((r: any) => r.id ?? '');
};

const gistLoad = (token: string, gistId: string): Promise<string> =>
    fetch(`https://api.github.com/gists/${gistId}`, { headers: gistHeaders(token) })
        .then((r: any) => r.json())
        .then((r: any) => r.files?.[GIST_FILENAME]?.content ?? '');

const PluginSync: Plugin = {
    ...manifest,

    onStart() {
        // installPlugin hook — yeni kurulumları otomatik kaydet
        const ep = (window as any).enmity?.plugins;
        if (!ep?.installPlugin) return;
        const _orig = ep.installPlugin.bind(ep);
        Object.defineProperty(ep, 'installPlugin', {
            configurable: true,
            value: (url: string, cb: any) => {
                _orig(url, (res: any) => {
                    try {
                        if (res?.kind === 'success' || res === true) {
                            const name = url.split('/').pop()?.replace(/\.js$/i, '') ?? '';
                            if (name) { const u = s.urls(); u[name] = url; s.setUrls(u); }
                        }
                    } catch {}
                    cb?.(res);
                });
            },
        });
    },

    onStop() { Patcher.unpatchAll(); },

    getSettingsPanel({ settings: _s2 }: { settings: any }) {
        const Panel = () => {
            const [token, setToken] = React.useState(s.token());
            const [gistId, setGistId] = React.useState(s.gistId());
            const [status, setStatus] = React.useState('');
            const [busy, setBusy] = React.useState(false);

            const plugins = getPlugins() ?? [];
            const urls = s.urls();
            const withUrl = plugins.filter((p: any) => urls[p.name]).length;

            const buildData = () => JSON.stringify({
                version: 1,
                savedAt: new Date().toISOString(),
                plugins: plugins.map((p: any) => ({
                    name: p.name,
                    version: p.version,
                    url: urls[p.name] ?? '',
                })),
            }, null, 2);

            const installList = (arr: any[]) => {
                const ep = (window as any).enmity?.plugins;
                let n = 0;
                arr.forEach((p: any) => {
                    const url: string = typeof p === 'string' ? p : p?.url;
                    if (!url) return;
                    n++;
                    try { ep?.installPlugin?.(url, () => {}); } catch {}
                });
                return n;
            };

            // Kaydet token ve gistId
            const handleSaveSettings = () => {
                set(ID, 'ghToken', token.trim());
                set(ID, 'gistId', gistId.trim());
                Toasts.open({ content: 'Ayarlar kaydedildi!' });
            };

            // GitHub Gist'e kaydet (cloud)
            const handleCloudSave = () => {
                const t = token.trim();
                if (!t) { Toasts.open({ content: 'Önce GitHub token gir!' }); return; }
                setBusy(true);
                gistSave(t, gistId.trim(), buildData())
                    .then((id: string) => {
                        if (id) { set(ID, 'gistId', id); setGistId(id); }
                        setStatus(`✓ Cloud\'a kaydedildi · Gist: ${id}`);
                        Toasts.open({ content: 'Cloud\'a kaydedildi!' });
                        setBusy(false);
                    })
                    .catch(() => { Toasts.open({ content: 'Gist kaydetme hatası!' }); setBusy(false); });
            };

            // GitHub Gist'ten yükle (cloud)
            const handleCloudLoad = () => {
                const t = token.trim();
                const g = gistId.trim();
                if (!t || !g) { Toasts.open({ content: 'Token ve Gist ID gerekli!' }); return; }
                setBusy(true);
                gistLoad(t, g)
                    .then((content: string) => {
                        const data = JSON.parse(content);
                        if (!Array.isArray(data?.plugins)) { Toasts.open({ content: 'Geçersiz format!' }); setBusy(false); return; }
                        const n = installList(data.plugins);
                        setStatus(`${n} plugin yükleniyor...`);
                        Toasts.open({ content: `${n} plugin yükleniyor...` });
                        setBusy(false);
                    })
                    .catch(() => { Toasts.open({ content: 'Gist yüklenemedi!' }); setBusy(false); });
            };

            // Yerel dışa aktar (Share sheet)
            const handleLocalExport = () => {
                const data = buildData();
                const ShareModule = getByProps('share', 'sharedAction');
                if (ShareModule?.share) {
                    ShareModule.share({ message: data, title: 'PluginSync.json' })
                        .then(() => setStatus(`${plugins.length} plugin kaydedildi`))
                        .catch(() => { Clipboard.setString(data); Toasts.open({ content: 'Panoya kopyalandı!' }); });
                } else {
                    Clipboard.setString(data);
                    Toasts.open({ content: 'Panoya kopyalandı!' });
                }
            };

            // Yerel içe aktar (Dosya seçici)
            const handleLocalImport = () => {
                const DocPicker = getByProps('pickSingle', 'pick') ?? getByProps('pick', 'pickDirectory');
                if (DocPicker?.pick || DocPicker?.pickSingle) {
                    const fn = DocPicker.pickSingle ?? ((...a: any[]) => DocPicker.pick(...a).then((r: any[]) => r[0]));
                    fn({ type: ['public.json', 'public.text', '*/*'] })
                        .then((r: any) => fetch(r?.uri ?? r?.fileCopyUri ?? ''))
                        .then((r: any) => r.text())
                        .then((text: string) => {
                            const data = JSON.parse(text);
                            if (!Array.isArray(data?.plugins)) { Toasts.open({ content: 'Geçersiz format!' }); return; }
                            const n = installList(data.plugins);
                            setStatus(`${n} plugin yükleniyor...`);
                            Toasts.open({ content: `${n} plugin yükleniyor...` });
                        })
                        .catch(() => Toasts.open({ content: 'Dosya okunamadı!' }));
                } else {
                    Clipboard.getString().then((text: string) => {
                        try {
                            const data = JSON.parse(text);
                            if (!Array.isArray(data?.plugins)) { Toasts.open({ content: 'Geçersiz format!' }); return; }
                            const n = installList(data.plugins);
                            Toasts.open({ content: `${n} plugin yükleniyor...` });
                        } catch { Toasts.open({ content: 'Pano okunamadı!' }); }
                    });
                }
            };

            return React.createElement(React.Fragment, null,
                // ÖZET
                React.createElement(FormSection, { title: 'ÖZET' },
                    React.createElement(FormRow, {
                        label: `${plugins.length} Plugin · ${withUrl}/${plugins.length} URL Kayıtlı`,
                        subLabel: status || (withUrl < plugins.length ? `${plugins.length - withUrl} plugin URL\'si eksik` : 'Tüm URL\'ler kayıtlı ✓'),
                    })
                ),
                // GITHUB GIST (Cloud)
                React.createElement(FormSection, { title: 'CLOUD SYNC (GitHub Gist)' },
                    React.createElement(View, { style: { paddingHorizontal: 16, paddingTop: 8 } },
                        React.createElement(TextInput, {
                            value: token,
                            onChangeText: setToken,
                            placeholder: 'GitHub Personal Access Token (gist izni)',
                            placeholderTextColor: '#72767d',
                            secureTextEntry: true,
                            style: { color: '#fff', backgroundColor: '#2f3136', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 6 },
                            autoCapitalize: 'none', autoCorrect: false,
                        }),
                        React.createElement(TextInput, {
                            value: gistId,
                            onChangeText: setGistId,
                            placeholder: 'Gist ID (ilk kayıtta otomatik oluşturulur)',
                            placeholderTextColor: '#72767d',
                            style: { color: '#fff', backgroundColor: '#2f3136', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 4 },
                            autoCapitalize: 'none', autoCorrect: false,
                        })
                    ),
                    React.createElement(FormRow, { label: 'Kaydet', subLabel: 'Token ve Gist ID\'yi sakla', onPress: handleSaveSettings }),
                    React.createElement(FormRow, { label: busy ? 'İşleniyor...' : '☁ Cloud\'a Yedekle', subLabel: 'Plugin listeni GitHub Gist\'e kaydet', onPress: busy ? undefined : handleCloudSave }),
                    React.createElement(FormRow, { label: busy ? 'İşleniyor...' : '☁ Cloud\'dan Geri Yükle', subLabel: 'Gist\'teki plugin listeni yükle ve kur', onPress: busy ? undefined : handleCloudLoad })
                ),
                // YEREL
                React.createElement(FormSection, { title: 'YEREL (Dosya)' },
                    React.createElement(FormRow, { label: '📤 Dosyaya Kaydet', subLabel: 'Paylaşım menüsü → "Dosyalara Kaydet"', onPress: handleLocalExport }),
                    React.createElement(FormRow, { label: '📥 Dosyadan İçe Aktar', subLabel: 'Dosya seçici açılır → JSON dosyasını seç', onPress: handleLocalImport })
                ),
                // YÜKLÜ PLUGİNLER
                React.createElement(FormSection, { title: `YÜKLÜ PLUGİNLER (${plugins.length})` },
                    ...plugins.map((p: any) =>
                        React.createElement(FormRow, {
                            key: p.name,
                            label: p.name,
                            subLabel: `v${p.version} · ${urls[p.name] ? '✓ URL kayıtlı' : '✗ URL yok'}`,
                        })
                    )
                )
            );
        };
        return React.createElement(Panel, null);
    },
};

registerPlugin(PluginSync);
