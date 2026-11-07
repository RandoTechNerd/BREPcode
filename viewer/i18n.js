// Interface languages (Settings > Language).
//
// The app's text lives inline across a very large page, so rather than a key
// on every element this translates EXACT labels where they are drawn: a text
// node, placeholder, title or aria-label whose whole text is in the table is
// swapped, and the English is kept on the node so switching back restores it.
// New UI (a window opening, a dialog drawn) is caught as it appears.
//
// Deliberately left alone: the code editor, the chat, model and part names,
// numbers, and anything under [data-no-i18n]. Longer help text stays English;
// the assistant already answers in whatever language it is asked in.
//
// Order of every row: es, fr, de, it, pt-BR, ja, zh-CN, ko, pl, tr.

export const LANGS = [
  ["en", "English"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["it", "Italiano"],
  ["pt", "Português (Brasil)"], ["ja", "日本語"], ["zh", "简体中文"], ["ko", "한국어"], ["pl", "Polski"], ["tr", "Türkçe"],
];
const ORDER = ["es", "fr", "de", "it", "pt", "ja", "zh", "ko", "pl", "tr"];

const T = {
  "Settings": ["Ajustes", "Paramètres", "Einstellungen", "Impostazioni", "Configurações", "設定", "设置", "설정", "Ustawienia", "Ayarlar"],
  "Editor": ["Editor", "Éditeur", "Editor", "Editor", "Editor", "エディター", "编辑器", "편집기", "Edytor", "Düzenleyici"],
  "Code": ["Código", "Code", "Code", "Codice", "Código", "コード", "代码", "코드", "Kod", "Kod"],
  "Design": ["Diseño", "Conception", "Konstruktion", "Progetto", "Projeto", "設計", "设计", "디자인", "Projekt", "Tasarım"],
  "drag to orbit · scroll to zoom": ["arrastrar: girar · rueda: zoom", "glisser : pivoter · molette : zoom", "Ziehen: drehen · Rad: zoomen", "trascina: ruota · rotella: zoom", "arrastar: girar · roda: zoom", "ドラッグ:回転 · ホイール:ズーム", "拖动旋转 · 滚轮缩放", "드래그: 회전 · 휠: 확대", "przeciągnij: obrót · kółko: zoom", "sürükle: döndür · tekerlek: zoom"],
  "Free CAD in your browser": ["CAD gratis en tu navegador", "CAO gratuite dans votre navigateur", "Kostenloses CAD im Browser", "CAD gratuito nel browser", "CAD grátis no navegador", "ブラウザで使える無料CAD", "浏览器中的免费 CAD", "브라우저에서 쓰는 무료 CAD", "Darmowy CAD w przeglądarce", "Tarayıcınızda ücretsiz CAD"],
  "Just tell me what to print": ["Dime qué imprimir", "Dites-moi quoi imprimer", "Sag mir einfach, was ich drucken soll", "Dimmi cosa stampare", "Diga o que imprimir", "印刷したいものを言うだけ", "告诉我要打印什么", "출력할 것을 말해 주세요", "Powiedz, co wydrukować", "Ne yazdıracağımı söyle"],
  "Fix or upgrade an STL": ["Arregla o mejora un STL", "Réparer ou améliorer un STL", "Ein STL reparieren oder verbessern", "Ripara o migliora un STL", "Corrigir ou melhorar um STL", "STLを修復・改良", "修复或升级 STL", "STL 수정 또는 개선", "Napraw lub ulepsz STL", "Bir STL'yi onar veya geliştir"],
  "Try an example": ["Prueba un ejemplo", "Essayer un exemple", "Ein Beispiel ausprobieren", "Prova un esempio", "Experimente um exemplo", "サンプルを試す", "试试示例", "예제 사용해 보기", "Wypróbuj przykład", "Bir örnek dene"],
  "a real model, ready to change": ["un modelo real, listo para cambiar", "un vrai modèle, prêt à modifier", "ein echtes Modell, bereit zum Ändern", "un modello reale, pronto da modificare", "um modelo real, pronto para alterar", "すぐに変更できる実際のモデル", "可直接修改的真实模型", "바로 바꿀 수 있는 실제 모델", "prawdziwy model, gotowy do zmian", "değiştirmeye hazır gerçek bir model"],
  "Take the 2-minute tour": ["Haz el recorrido de 2 minutos", "Faire la visite de 2 minutes", "Die 2-Minuten-Tour machen", "Fai il tour di 2 minuti", "Faça o tour de 2 minutos", "2分間ツアー", "2 分钟导览", "2분 둘러보기", "Zobacz 2-minutowy przewodnik", "2 dakikalık turu başlat"],
  "Tour": ["Recorrido", "Visite", "Tour", "Tour", "Tour", "ツアー", "导览", "둘러보기", "Przewodnik", "Tur"],
  "Docs": ["Docs", "Docs", "Doku", "Documenti", "Docs", "ドキュメント", "文档", "문서", "Dokumentacja", "Belgeler"],
  "Design help": ["Ayuda", "Aide", "Hilfe", "Aiuto", "Ajuda", "ヘルプ", "帮助", "도움말", "Pomoc", "Yardım"],
  "Rotate around": ["Girar alrededor de", "Pivoter autour de", "Drehen um", "Ruota attorno a", "Girar em torno de", "回転の中心", "旋转中心", "회전 중심", "Obracaj wokół", "Etrafında döndür"],
  "The model's centre": ["El centro del modelo", "Le centre du modèle", "Die Modellmitte", "Il centro del modello", "O centro do modelo", "モデルの中心", "模型中心", "모델 중심", "Środek modelu", "Modelin merkezi"],
  "The view centre (classic)": ["El centro de la vista (clásico)", "Le centre de la vue (classique)", "Die Ansichtsmitte (klassisch)", "Il centro della vista (classico)", "O centro da vista (clássico)", "ビューの中心（従来）", "视图中心（经典）", "뷰 중심(클래식)", "Środek widoku (klasycznie)", "Görünümün merkezi (klasik)"],
  "Move model for windows": ["Mover el modelo por las ventanas", "Déplacer le modèle pour les fenêtres", "Modell für Fenster verschieben", "Sposta il modello per le finestre", "Mover o modelo pelas janelas", "ウィンドウに合わせてモデルを移動", "为窗口移动模型", "창에 맞춰 모델 이동", "Przesuwaj model dla okien", "Pencereler için modeli taşı"],
  "Editor opens": ["El editor se abre", "L'éditeur s'ouvre", "Editor öffnet", "L'editor si apre", "O editor abre", "エディターの位置", "编辑器打开位置", "편집기 위치", "Edytor otwiera się", "Düzenleyici açılır"],
  "Filling the right": ["Ocupando la derecha", "Remplissant la droite", "Rechts füllend", "A destra", "Ocupando a direita", "右側いっぱい", "填满右侧", "오른쪽 채우기", "Wypełniając prawą stronę", "Sağı doldurarak"],
  "Filling the left": ["Ocupando la izquierda", "Remplissant la gauche", "Links füllend", "A sinistra", "Ocupando a esquerda", "左側いっぱい", "填满左侧", "왼쪽 채우기", "Wypełniając lewą stronę", "Solu doldurarak"],
  "In the stack": ["En la pila", "Dans la pile", "Im Stapel", "Nella pila", "Na pilha", "スタック内", "堆叠中", "스택 안", "W stosie", "Yığında"],
  "Top corner, opposite the editor": ["Esquina superior, frente al editor", "Coin supérieur, face à l'éditeur", "Obere Ecke, gegenüber dem Editor", "Angolo in alto, opposto all'editor", "Canto superior, oposto ao editor", "エディターの反対側の上隅", "编辑器对面的上角", "편집기 맞은편 위쪽 모서리", "Górny róg, naprzeciw edytora", "Düzenleyicinin karşısında üst köşe"],
  "Bottom corner, opposite the editor": ["Esquina inferior, frente al editor", "Coin inférieur, face à l'éditeur", "Untere Ecke, gegenüber dem Editor", "Angolo in basso, opposto all'editor", "Canto inferior, oposto ao editor", "エディターの反対側の下隅", "编辑器对面的下角", "편집기 맞은편 아래쪽 모서리", "Dolny róg, naprzeciw edytora", "Düzenleyicinin karşısında alt köşe"],
  "Assistant opens": ["El asistente se abre", "L'assistant s'ouvre", "Assistent öffnet", "L'assistente si apre", "O assistente abre", "アシスタントの位置", "助手打开位置", "도우미 위치", "Asystent otwiera się", "Asistan açılır"],
  "Tool bar": ["Barra de herramientas", "Barre d'outils", "Werkzeugleiste", "Barra strumenti", "Barra de ferramentas", "ツールバー", "工具栏", "도구 모음", "Pasek narzędzi", "Araç çubuğu"],
  "Along the top": ["Arriba", "En haut", "Oben", "In alto", "No topo", "上部", "顶部", "위쪽", "U góry", "Üstte"],
  "Down the left side": ["En el lado izquierdo", "Sur le côté gauche", "Links", "Sul lato sinistro", "No lado esquerdo", "左側", "左侧", "왼쪽", "Po lewej stronie", "Sol tarafta"],
  "Show the corner cube (see it on your desk)": ["Mostrar el cubo de la esquina (verlo en tu mesa)", "Afficher le cube d'angle (le voir sur votre bureau)", "Eckwürfel zeigen (auf dem Tisch ansehen)", "Mostra il cubo d'angolo (vedilo sulla scrivania)", "Mostrar o cubo do canto (ver na sua mesa)", "隅のキューブを表示（机の上で見る）", "显示角落立方体（在桌面上查看）", "모서리 큐브 표시(책상 위에서 보기)", "Pokaż kostkę w rogu (zobacz na biurku)", "Köşe küpünü göster (masanda gör)"],
  "3D mouse": ["Ratón 3D", "Souris 3D", "3D-Maus", "Mouse 3D", "Mouse 3D", "3Dマウス", "3D 鼠标", "3D 마우스", "Mysz 3D", "3B fare"],
  "Connect": ["Conectar", "Connecter", "Verbinden", "Collega", "Conectar", "接続", "连接", "연결", "Połącz", "Bağlan"],
  "Disconnect": ["Desconectar", "Déconnecter", "Trennen", "Scollega", "Desconectar", "切断", "断开", "연결 해제", "Rozłącz", "Bağlantıyı kes"],
  "Slow": ["Lento", "Lent", "Langsam", "Lento", "Lento", "遅い", "慢", "느리게", "Wolno", "Yavaş"],
  "Normal": ["Normal", "Normal", "Normal", "Normale", "Normal", "標準", "正常", "보통", "Normalnie", "Normal"],
  "Fast": ["Rápido", "Rapide", "Schnell", "Veloce", "Rápido", "速い", "快", "빠르게", "Szybko", "Hızlı"],
  "Language": ["Idioma", "Langue", "Sprache", "Lingua", "Idioma", "言語", "语言", "언어", "Język", "Dil"],
  "Match my system": ["Como mi sistema", "Comme mon système", "Wie mein System", "Come il sistema", "Como o sistema", "システムに合わせる", "跟随系统", "시스템 설정 따르기", "Jak w systemie", "Sistemime uy"],
  "Start with the sample cube": ["Empezar con el cubo de ejemplo", "Commencer avec le cube d'exemple", "Mit dem Beispielwürfel starten", "Inizia con il cubo di esempio", "Começar com o cubo de exemplo", "サンプルの立方体で開始", "以示例立方体开始", "예제 큐브로 시작", "Zacznij od przykładowej kostki", "Örnek küple başla"],
  "Snap windows to edges and corners while dragging": ["Ajustar ventanas a bordes y esquinas al arrastrar", "Aimanter les fenêtres aux bords et coins", "Fenster beim Ziehen an Kanten und Ecken einrasten", "Aggancia le finestre a bordi e angoli trascinando", "Encaixar janelas nas bordas e cantos ao arrastar", "ドラッグ時にウィンドウを端と角に吸着", "拖动时窗口吸附到边缘和角落", "드래그 시 창을 가장자리와 모서리에 맞춤", "Przyciągaj okna do krawędzi i rogów", "Sürüklerken pencereleri kenar ve köşelere yasla"],
  "Advanced": ["Avanzado", "Avancé", "Erweitert", "Avanzate", "Avançado", "詳細設定", "高级", "고급", "Zaawansowane", "Gelişmiş"],
  "Opens in": ["Abre en", "S'ouvre en", "Öffnet in", "Si apre in", "Abre em", "起動モード", "打开于", "시작 모드", "Otwiera się w", "Açılış modu"],
  "The mode I used last": ["El último modo usado", "Le dernier mode utilisé", "Der zuletzt genutzte Modus", "L'ultima modalità usata", "O último modo usado", "前回使ったモード", "上次使用的模式", "마지막으로 쓴 모드", "Ostatnio używany tryb", "Son kullandığım mod"],
  "Kernel": ["Núcleo", "Noyau", "Kernel", "Kernel", "Kernel", "カーネル", "内核", "커널", "Jądro", "Çekirdek"],
  "Tidy windows": ["Ordenar ventanas", "Ranger les fenêtres", "Fenster aufräumen", "Riordina finestre", "Organizar janelas", "ウィンドウを整列", "整理窗口", "창 정리", "Uporządkuj okna", "Pencereleri düzenle"],
  "Default lighting": ["Iluminación predeterminada", "Éclairage par défaut", "Standardbeleuchtung", "Illuminazione predefinita", "Iluminação padrão", "既定のライティング", "默认光照", "기본 조명", "Domyślne oświetlenie", "Varsayılan aydınlatma"],
  "Reset settings": ["Restablecer ajustes", "Réinitialiser", "Einstellungen zurücksetzen", "Ripristina impostazioni", "Redefinir configurações", "設定をリセット", "重置设置", "설정 초기화", "Resetuj ustawienia", "Ayarları sıfırla"],
  "Links": ["Enlaces", "Liens", "Links", "Link", "Links", "リンク", "链接", "링크", "Linki", "Bağlantılar"],
  "Website": ["Sitio web", "Site web", "Website", "Sito web", "Site", "ウェブサイト", "网站", "웹사이트", "Strona", "Web sitesi"],
  "Keyboard shortcuts": ["Atajos de teclado", "Raccourcis clavier", "Tastenkürzel", "Scorciatoie da tastiera", "Atalhos de teclado", "キーボードショートカット", "键盘快捷键", "키보드 단축키", "Skróty klawiszowe", "Klavye kısayolları"],
  "Credits & licences": ["Créditos y licencias", "Crédits et licences", "Danksagung & Lizenzen", "Crediti e licenze", "Créditos e licenças", "クレジットとライセンス", "致谢与许可", "크레딧 및 라이선스", "Podziękowania i licencje", "Emeği geçenler ve lisanslar"],
  "Theme": ["Tema", "Thème", "Farbschema", "Tema", "Tema", "テーマ", "主题", "테마", "Motyw", "Tema"],
  "Dark": ["Oscuro", "Sombre", "Dunkel", "Scuro", "Escuro", "ダーク", "深色", "다크", "Ciemny", "Koyu"],
  "Light": ["Claro", "Clair", "Hell", "Chiaro", "Claro", "ライト", "浅色", "라이트", "Jasny", "Açık"],
  "Colorful": ["Colorido", "Coloré", "Bunt", "Colorato", "Colorido", "カラフル", "多彩", "컬러풀", "Kolorowy", "Renkli"],
  "Home": ["Inicio", "Accueil", "Start", "Home", "Início", "ホーム", "主视图", "홈", "Start", "Ana görünüm"],
  "close": ["cerrar", "fermer", "schließen", "chiudi", "fechar", "閉じる", "关闭", "닫기", "zamknij", "kapat"],
  "model name": ["nombre del modelo", "nom du modèle", "Modellname", "nome del modello", "nome do modelo", "モデル名", "模型名称", "모델 이름", "nazwa modelu", "model adı"],
  "builds as you type": ["se construye mientras escribes", "se construit pendant la saisie", "baut beim Tippen", "si costruisce mentre scrivi", "constrói enquanto você digita", "入力するとビルド", "输入即构建", "입력하면 바로 빌드", "buduje się podczas pisania", "yazdıkça oluşur"],
  "Exact": ["Exacto", "Exact", "Exakt", "Esatto", "Exato", "厳密", "精确", "정확", "Dokładny", "Tam"],
  "Dims": ["Cotas", "Cotes", "Maße", "Quote", "Cotas", "寸法", "尺寸", "치수", "Wymiary", "Ölçüler"],
  // export dialog
  "Export": ["Exportar", "Exporter", "Exportieren", "Esporta", "Exportar", "エクスポート", "导出", "내보내기", "Eksportuj", "Dışa aktar"],
  "Cancel": ["Cancelar", "Annuler", "Abbrechen", "Annulla", "Cancelar", "キャンセル", "取消", "취소", "Anuluj", "İptal"],
  "Format": ["Formato", "Format", "Format", "Formato", "Formato", "形式", "格式", "형식", "Format", "Biçim"],
  "Colour": ["Color", "Couleur", "Farbe", "Colore", "Cor", "色", "颜色", "색상", "Kolor", "Renk"],
  "Prepare for": ["Preparar para", "Préparer pour", "Vorbereiten für", "Prepara per", "Preparar para", "準備先", "准备用于", "준비 대상", "Przygotuj dla", "Şunun için hazırla"],
  "Plate": ["Placa", "Plateau", "Platte", "Piatto", "Placa", "プレート", "打印板", "플레이트", "Płyta", "Tabla"],
  "Project": ["Proyecto", "Projet", "Projekt", "Progetto", "Projeto", "プロジェクト", "项目", "프로젝트", "Projekt", "Proje"],
  "editable source": ["código editable", "source modifiable", "bearbeitbarer Quelltext", "sorgente modificabile", "fonte editável", "編集可能なソース", "可编辑源码", "편집 가능한 소스", "edytowalne źródło", "düzenlenebilir kaynak"],
  "Share link": ["Enlace para compartir", "Lien de partage", "Link teilen", "Link di condivisione", "Link de compartilhamento", "共有リンク", "分享链接", "공유 링크", "Link do udostępnienia", "Paylaşım bağlantısı"],
  "the model, in a URL": ["el modelo, en una URL", "le modèle, dans une URL", "das Modell als URL", "il modello, in un URL", "o modelo, em uma URL", "URLにしたモデル", "URL 中的模型", "URL에 담긴 모델", "model w adresie URL", "bir URL'de model"],
  "Mesh": ["Malla", "Maillage", "Netz", "Mesh", "Malha", "メッシュ", "网格", "메시", "Siatka", "Ağ"],
  "CAD (solid)": ["CAD (sólido)", "CAO (solide)", "CAD (Volumen)", "CAD (solido)", "CAD (sólido)", "CAD（ソリッド）", "CAD（实体）", "CAD(솔리드)", "CAD (bryła)", "CAD (katı)"],
  "faceted or true curves": ["facetado o curvas reales", "facettes ou vraies courbes", "facettiert oder echte Kurven", "sfaccettato o curve vere", "facetado ou curvas reais", "ファセットまたは真の曲面", "多面体或真实曲面", "면 분할 또는 실제 곡면", "fasety lub prawdziwe krzywe", "yüzeyli veya gerçek eğriler"],
  "Drawing / Web": ["Dibujo / Web", "Dessin / Web", "Zeichnung / Web", "Disegno / Web", "Desenho / Web", "図面 / Web", "图纸 / 网页", "도면 / 웹", "Rysunek / Web", "Çizim / Web"],
  "SVG blueprint": ["Plano SVG", "Plan SVG", "SVG-Bauplan", "Disegno SVG", "Planta SVG", "SVG図面", "SVG 图纸", "SVG 도면", "Rysunek SVG", "SVG çizimi"],
  "3-view drawing": ["dibujo de 3 vistas", "dessin 3 vues", "3-Ansichten-Zeichnung", "disegno a 3 viste", "desenho de 3 vistas", "三面図", "三视图", "3면도", "rysunek 3 rzutów", "3 görünüşlü çizim"],
  "web viewers": ["visores web", "visionneuses web", "Web-Viewer", "visualizzatori web", "visualizadores web", "Webビューア", "网页查看器", "웹 뷰어", "przeglądarki web", "web görüntüleyiciler"],
  "Sheet": ["Hoja", "Feuille", "Blatt", "Foglio", "Folha", "用紙", "图幅", "시트", "Arkusz", "Pafta"],
  "Title block": ["Cajetín", "Cartouche", "Schriftfeld", "Cartiglio", "Legenda", "表題欄", "标题栏", "표제란", "Tabliczka", "Antet"],
  "Paper": ["Papel", "Papier", "Papier", "Carta", "Papel", "用紙", "纸张", "용지", "Papier", "Kağıt"],
  "Print / PDF": ["Imprimir / PDF", "Imprimer / PDF", "Drucken / PDF", "Stampa / PDF", "Imprimir / PDF", "印刷 / PDF", "打印 / PDF", "인쇄 / PDF", "Drukuj / PDF", "Yazdır / PDF"],
  "Hole callouts": ["Notas de agujeros", "Cotes de perçage", "Bohrungsangaben", "Richiami fori", "Chamadas de furos", "穴の注記", "孔标注", "구멍 주석", "Opisy otworów", "Delik notları"],
  "Material": ["Material", "Matériau", "Material", "Materiale", "Material", "材料", "材料", "재료", "Materiał", "Malzeme"],
  "Drawn by": ["Dibujado por", "Dessiné par", "Gezeichnet von", "Disegnato da", "Desenhado por", "作図者", "绘制人", "작성자", "Narysował", "Çizen"],
  // Design mode
  "Browser": ["Navegador", "Navigateur", "Browser", "Browser", "Navegador", "ブラウザー", "浏览器", "브라우저", "Przeglądarka", "Gezgin"],
  "Timeline": ["Línea de tiempo", "Chronologie", "Zeitachse", "Timeline", "Linha do tempo", "タイムライン", "时间线", "타임라인", "Oś czasu", "Zaman çizelgesi"],
  "Select": ["Seleccionar", "Sélection", "Auswählen", "Seleziona", "Selecionar", "選択", "选择", "선택", "Zaznacz", "Seç"],
  "Move": ["Mover", "Déplacer", "Verschieben", "Sposta", "Mover", "移動", "移动", "이동", "Przesuń", "Taşı"],
  "Rotate": ["Rotar", "Rotation", "Drehen", "Ruota", "Rotacionar", "回転", "旋转", "회전", "Obróć", "Döndür"],
  "Scale": ["Escalar", "Échelle", "Skalieren", "Scala", "Escala", "尺度", "缩放", "크기 조정", "Skaluj", "Ölçekle"],
  "Sketch": ["Boceto", "Esquisse", "Skizze", "Schizzo", "Esboço", "スケッチ", "草图", "스케치", "Szkic", "Eskiz"],
  "Primitive": ["Primitiva", "Primitive", "Grundkörper", "Primitiva", "Primitiva", "プリミティブ", "基本体", "기본 도형", "Bryła", "Temel şekil"],
  "Extrude": ["Extruir", "Extrusion", "Extrudieren", "Estrudi", "Extrudar", "押し出し", "拉伸", "돌출", "Wyciągnij", "Ekstrüzyon"],
  "Revolve": ["Revolución", "Révolution", "Drehung", "Rivoluzione", "Revolução", "回転体", "旋转体", "회전체", "Obrót", "Döndürme"],
  "Hole": ["Agujero", "Perçage", "Bohrung", "Foro", "Furo", "穴", "孔", "구멍", "Otwór", "Delik"],
  "Hardware": ["Tornillería", "Visserie", "Normteile", "Minuteria", "Fixadores", "締結部品", "紧固件", "체결 부품", "Złączki", "Bağlantı elemanları"],
  "Press-pull": ["Presionar/tirar", "Pousser/tirer", "Drücken/Ziehen", "Spingi/tira", "Pressionar/puxar", "プレス/プル", "推拉", "밀기/당기기", "Wciśnij/wyciągnij", "Bas/çek"],
  "Fillet": ["Empalme", "Congé", "Verrundung", "Raccordo", "Concordância", "フィレット", "圆角", "필렛", "Zaokrąglenie", "Yuvarlatma"],
  "Chamfer": ["Chaflán", "Chanfrein", "Fase", "Smusso", "Chanfro", "面取り", "倒角", "모따기", "Fazowanie", "Pah"],
  "Shell": ["Vaciado", "Coque", "Schale", "Guscio", "Casca", "シェル", "抽壳", "쉘", "Skorupa", "Kabuk"],
  "Split": ["Dividir", "Scinder", "Teilen", "Dividi", "Dividir", "分割", "分割", "분할", "Podziel", "Böl"],
  "Combine": ["Combinar", "Combiner", "Kombinieren", "Combina", "Combinar", "結合", "组合", "결합", "Połącz bryły", "Birleştir"],
  "Mirror": ["Simetría", "Symétrie", "Spiegeln", "Specchia", "Espelhar", "ミラー", "镜像", "대칭", "Odbicie", "Ayna"],
  "Linear": ["Lineal", "Linéaire", "Linear", "Lineare", "Linear", "矩形パターン", "线性阵列", "선형", "Liniowy", "Doğrusal"],
  "Circular": ["Circular", "Circulaire", "Kreisförmig", "Circolare", "Circular", "円形パターン", "环形阵列", "원형", "Kołowy", "Dairesel"],
  "Measure": ["Medir", "Mesurer", "Messen", "Misura", "Medir", "計測", "测量", "측정", "Pomiar", "Ölç"],
  "Parameters": ["Parámetros", "Paramètres", "Parameter", "Parametri", "Parâmetros", "パラメータ", "参数", "매개변수", "Parametry", "Parametreler"],
  "Properties": ["Propiedades", "Propriétés", "Eigenschaften", "Proprietà", "Propriedades", "プロパティ", "属性", "속성", "Właściwości", "Özellikler"],
  "Create": ["Crear", "Créer", "Erstellen", "Crea", "Criar", "作成", "创建", "만들기", "Utwórz", "Oluştur"],
  "Modify": ["Modificar", "Modifier", "Ändern", "Modifica", "Modificar", "修正", "修改", "수정", "Modyfikuj", "Değiştir"],
  "Pattern": ["Patrón", "Répétition", "Muster", "Serie", "Padrão", "パターン", "阵列", "패턴", "Szyk", "Desen"],
  "Inspect": ["Inspeccionar", "Inspecter", "Prüfen", "Ispeziona", "Inspecionar", "検査", "检查", "검사", "Analiza", "İncele"],
};

// The table as { lang: Map(english -> translated) }
const DICT = Object.fromEntries(ORDER.map((l, i) => [l, new Map(Object.entries(T).map(([en, row]) => [en, row[i]]))]));
export const STRINGS = Object.keys(T);
export const TABLE = T;

// "auto" -> the browser's language if we have it, else English
export function resolveLang(pref, navLang = (typeof navigator !== "undefined" && navigator.language) || "en") {
  if (pref && pref !== "auto") return DICT[pref] || pref === "en" ? pref : "en";
  const base = String(navLang).toLowerCase().split("-")[0];
  return DICT[base] ? base : "en";
}
export function translate(text, lang) {
  if (lang === "en" || !DICT[lang]) return text;
  return DICT[lang].get(text) ?? text;
}

const SKIP = "textarea, script, style, code, pre, svg, [contenteditable], [data-no-i18n], #code, #chat-msgs, #model-name, #dz-tree, .dz-args, #hint";
const ATTRS = ["placeholder", "title", "aria-label"];
let current = "en", observer = null, queued = new Set(), rafId = 0;

// Each node remembers its English (__en) and exactly what was last written
// into it (__shown). Text that is neither means the APP wrote something new
// there, which becomes the new English. Comparing against "the translation in
// the current language" instead got switching languages wrong: German still on
// screen after picking Japanese read as fresh English and stayed.
function fixText(node) {
  const p = node.parentElement;
  if (!p || p.closest(SKIP)) return;
  const raw = node.nodeValue;
  if (node.__en != null && raw !== node.__shown) node.__en = null;     // rewritten by the app
  const en = node.__en ?? raw.trim();
  if (!en) return;
  const want = translate(en, current);
  if (want === en && node.__en == null) return;             // not in the table, never touched
  node.__en = en;
  const lead = raw.match(/^\s*/)[0], tail = raw.match(/\s*$/)[0];
  const next = lead + want + tail;
  if (raw !== next) node.nodeValue = next;
  node.__shown = next;
}
function fixAttrs(el) {
  if (el.closest(SKIP)) return;
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const key = `__en_${a}`, shown = `__shown_${a}`;
    const v = el.getAttribute(a);
    if (el[key] != null && v !== el[shown]) el[key] = null;            // rewritten by the app
    const en = el[key] ?? v.trim();
    const want = translate(en, current);
    if (want === en && el[key] == null) continue;
    el[key] = en;
    if (v !== want) el.setAttribute(a, want);
    el[shown] = want;
  }
}
function walk(root) {
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1) return;
  fixAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = w.nextNode())) { if (n.nodeType === 3) fixText(n); else fixAttrs(n); }
}
function flush() {
  rafId = 0;
  const batch = [...queued]; queued.clear();
  observer?.disconnect();
  for (const n of batch) if (n.isConnected) walk(n);
  observer?.observe(document.body, { childList: true, subtree: true, characterData: true });
}

// Switch the interface to `lang` ("en" restores the English everywhere).
export function applyLanguage(lang) {
  current = DICT[lang] ? lang : "en";
  document.documentElement.lang = current === "pt" ? "pt-BR" : current === "zh" ? "zh-CN" : current;
  if (!observer) {
    observer = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "characterData") queued.add(m.target);
        else for (const a of m.addedNodes) queued.add(a);
      }
      if (queued.size && !rafId) rafId = requestAnimationFrame(flush);
    });
  }
  queued.add(document.body);
  flush();
}
