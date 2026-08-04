var vi = Object.defineProperty;
var a = (s, t) => vi(s, "name", { value: t, configurable: !0 });
function Ci(s) {
  const t = Math.sqrt(Math.pow(s, 2) + Math.pow(s, 2)) / 2;
  return -(s - Math.sqrt(Math.pow(s, 2) - Math.pow(t, 2))) / t;
}
a(Ci, "e");
function A(s, t, e) {
  return { x: s ?? 0, y: t ?? 0, z: e ?? 0 };
}
a(A, "t");
function x(s, t) {
  return { x: s ?? 0, y: t ?? 0 };
}
a(x, "s");
const k = class k {
  static next() {
    return (++k.seed).toString(16).toUpperCase();
  }
  static peek() {
    return (k.seed + 1).toString(16).toUpperCase();
  }
  static clear() {
    k.seed = 0;
  }
};
a(k, "h");
let F = k;
F.seed = 0;
const Ye = class Ye {
  constructor() {
    this.handle = F.next();
  }
  dxfy(t) {
    t.type("ENDBLK"), t.handle(this.handle), t.push(330, this.ownerObjectHandle), t.subclassMarker("AcDbEntity"), t.layerName("0"), t.subclassMarker("AcDbBlockEnd");
  }
};
a(Ye, "o");
let ls = Ye;
const st = /* @__PURE__ */ a((s, t) => ({ tl: s, br: t }), "d"), $ = class $ {
  static centerRadiusBBox(t, e) {
    return st(A(t.x - e, t.y + e), A(t.x + e, t.y - e));
  }
  static pointBBox(t) {
    return st(A(t.x - 100, t.y + 100), A(t.x + 100, t.y - 100));
  }
  static lineBBox(t, e) {
    const n = t.x > e.x ? t.x : e.x, i = t.x < e.x ? t.x : e.x, h = t.y > e.y ? t.y : e.y, o = t.y < e.y ? t.y : e.y, r = t.z > e.z ? t.z : e.z, f = t.z < e.z ? t.z : e.z;
    return st(A(i, h, f), A(n, o, r));
  }
  static verticesBBox(t) {
    let e = -1 / 0, n = -1 / 0, i = 1 / 0, h = 1 / 0;
    for (let o = 0; o < t.length; o++) {
      const { x: r, y: f } = t[o];
      e < r && (e = r), n < f && (n = f), i > r && (i = r), h > f && (h = f);
    }
    return st(A(i, n), A(e, h));
  }
  static boundingBox(t) {
    if (t.length === 0) return $.pointBBox(A());
    const e = [];
    for (let n = 0; n < t.length; n++) {
      const i = t[n];
      e.push(i.tl, i.br);
    }
    return $.verticesBBox(e);
  }
  static boundingBoxCenter(t) {
    return A(t.tl.x + (t.br.x - t.tl.x) / 2, t.br.y + (t.tl.y - t.br.y) / 2, 0);
  }
  static boundingBoxHeight(t) {
    return t.tl.y - t.br.y;
  }
};
a($, "a");
let m = $;
var xt, rs, fs;
(function(s) {
  s[s.None = 0] = "None", s[s.Frozen = 1] = "Frozen", s[s.FrozenInNewViewports = 2] = "FrozenInNewViewports", s[s.Locked = 4] = "Locked", s[s.XRefDependent = 16] = "XRefDependent", s[s.XRefResolved = 32] = "XRefResolved";
})(xt || (xt = {})), (function(s) {
  s[s.None = 0] = "None", s[s.DescribeShape = 1] = "DescribeShape", s[s.VerticalText = 4] = "VerticalText", s[s.XRefDependent = 16] = "XRefDependent", s[s.XRefResolved = 32] = "XRefResolved";
})(rs || (rs = {})), (function(s) {
  s[s.None = 0] = "None", s[s.PaperSpace = 1] = "PaperSpace", s[s.XRefDependent = 16] = "XRefDependent", s[s.XRefResolved = 32] = "XRefResolved";
})(fs || (fs = {}));
const Te = class Te {
  constructor(t) {
    this.type = t, this.handle = F.next();
  }
  dxfy(t) {
    t.type(this.type), t.handle(this.handle), t.push(330, this.ownerObjectHandle), t.subclassMarker("AcDbSymbolTableRecord");
  }
};
a(Te, "u");
let Y = Te;
const Be = class Be extends Y {
  constructor(t, e, n, i) {
    super("LAYER"), this.name = t, this.colorNumber = e, this.lineType = n, this.flags = i ?? xt.None;
  }
  dxfy(t) {
    super.dxfy(t), t.subclassMarker("AcDbLayerTableRecord"), t.name(this.name), t.push(70, this.flags), t.colorNumber(this.colorNumber), t.push(420, this.trueColor), t.lineType(this.lineType), t.push(370, 0), t.push(390, 0), t.push(347, this.materialObject);
  }
};
a(Be, "c");
let O = Be;
O.layerZeroName = "0";
const Xi = [[["00", "00", "00"], 0, ["0", "0", "0"]], [["FF", "00", "00"], 1, ["255", "0", "0"]], [["FF", "FF", "00"], 2, ["255", "255", "0"]], [["00", "FF", "00"], 3, ["0", "255", "0"]], [["00", "FF", "FF"], 4, ["0", "255", "255"]], [["00", "00", "FF"], 5, ["0", "0", "255"]], [["FF", "00", "FF"], 6, ["255", "0", "255"]], [["FF", "FF", "FF"], 7, ["255", "255", "255"]], [["41", "41", "41"], 8, ["65", "65", "65"]], [["80", "80", "80"], 9, ["128", "128", "128"]], [["FF", "00", "00"], 10, ["255", "0", "0"]], [["FF", "AA", "AA"], 11, ["255", "170", "170"]], [["BD", "00", "00"], 12, ["189", "0", "0"]], [["BD", "7E", "7E"], 13, ["189", "126", "126"]], [["81", "00", "00"], 14, ["129", "0", "0"]], [["81", "56", "56"], 15, ["129", "86", "86"]], [["68", "00", "00"], 16, ["104", "0", "0"]], [["68", "45", "45"], 17, ["104", "69", "69"]], [["4F", "00", "00"], 18, ["79", "0", "0"]], [["4F", "35", "35"], 19, ["79", "53", "53"]], [["FF", "3F", "00"], 20, ["255", "63", "0"]], [["FF", "BF", "AA"], 21, ["255", "191", "170"]], [["BD", "2E", "00"], 22, ["189", "46", "0"]], [["BD", "8D", "7E"], 23, ["189", "141", "126"]], [["81", "1F", "00"], 24, ["129", "31", "0"]], [["81", "60", "56"], 25, ["129", "96", "86"]], [["68", "19", "00"], 26, ["104", "25", "0"]], [["68", "4E", "45"], 27, ["104", "78", "69"]], [["4F", "13", "00"], 28, ["79", "19", "0"]], [["4F", "3B", "35"], 29, ["79", "59", "53"]], [["FF", "7F", "00"], 30, ["255", "127", "0"]], [["FF", "D4", "AA"], 31, ["255", "212", "170"]], [["BD", "5E", "00"], 32, ["189", "94", "0"]], [["BD", "9D", "7E"], 33, ["189", "157", "126"]], [["81", "40", "00"], 34, ["129", "64", "0"]], [["81", "6B", "56"], 35, ["129", "107", "86"]], [["68", "34", "00"], 36, ["104", "52", "0"]], [["68", "56", "45"], 37, ["104", "86", "69"]], [["4F", "27", "00"], 38, ["79", "39", "0"]], [["4F", "42", "35"], 39, ["79", "66", "53"]], [["FF", "BF", "00"], 40, ["255", "191", "0"]], [["FF", "EA", "AA"], 41, ["255", "234", "170"]], [["BD", "8D", "00"], 42, ["189", "141", "0"]], [["BD", "AD", "7E"], 43, ["189", "173", "126"]], [["81", "60", "00"], 44, ["129", "96", "0"]], [["81", "76", "56"], 45, ["129", "118", "86"]], [["68", "4E", "00"], 46, ["104", "78", "0"]], [["68", "5F", "45"], 47, ["104", "95", "69"]], [["4F", "3B", "00"], 48, ["79", "59", "0"]], [["4F", "49", "35"], 49, ["79", "73", "53"]], [["FF", "FF", "00"], 50, ["255", "255", "0"]], [["FF", "FF", "AA"], 51, ["255", "255", "170"]], [["BD", "BD", "00"], 52, ["189", "189", "0"]], [["BD", "BD", "7E"], 53, ["189", "189", "126"]], [["81", "81", "00"], 54, ["129", "129", "0"]], [["81", "81", "56"], 55, ["129", "129", "86"]], [["68", "68", "00"], 56, ["104", "104", "0"]], [["68", "68", "45"], 57, ["104", "104", "69"]], [["4F", "4F", "00"], 58, ["79", "79", "0"]], [["4F", "4F", "35"], 59, ["79", "79", "53"]], [["BF", "FF", "00"], 60, ["191", "255", "0"]], [["EA", "FF", "AA"], 61, ["234", "255", "170"]], [["8D", "BD", "00"], 62, ["141", "189", "0"]], [["AD", "BD", "7E"], 63, ["173", "189", "126"]], [["60", "81", "00"], 64, ["96", "129", "0"]], [["76", "81", "56"], 65, ["118", "129", "86"]], [["4E", "68", "00"], 66, ["78", "104", "0"]], [["5F", "68", "45"], 67, ["95", "104", "69"]], [["3B", "4F", "00"], 68, ["59", "79", "0"]], [["49", "4F", "35"], 69, ["73", "79", "53"]], [["7F", "FF", "00"], 70, ["127", "255", "0"]], [["D4", "FF", "AA"], 71, ["212", "255", "170"]], [["5E", "BD", "00"], 72, ["94", "189", "0"]], [["9D", "BD", "7E"], 73, ["157", "189", "126"]], [["40", "81", "00"], 74, ["64", "129", "0"]], [["6B", "81", "56"], 75, ["107", "129", "86"]], [["34", "68", "00"], 76, ["52", "104", "0"]], [["56", "68", "45"], 77, ["86", "104", "69"]], [["27", "4F", "00"], 78, ["39", "79", "0"]], [["42", "4F", "35"], 79, ["66", "79", "53"]], [["3F", "FF", "00"], 80, ["63", "255", "0"]], [["BF", "FF", "AA"], 81, ["191", "255", "170"]], [["2E", "BD", "00"], 82, ["46", "189", "0"]], [["8D", "BD", "7E"], 83, ["141", "189", "126"]], [["1F", "81", "00"], 84, ["31", "129", "0"]], [["60", "81", "56"], 85, ["96", "129", "86"]], [["19", "68", "00"], 86, ["25", "104", "0"]], [["4E", "68", "45"], 87, ["78", "104", "69"]], [["13", "4F", "00"], 88, ["19", "79", "0"]], [["3B", "4F", "35"], 89, ["59", "79", "53"]], [["00", "FF", "00"], 90, ["0", "255", "0"]], [["AA", "FF", "AA"], 91, ["170", "255", "170"]], [["00", "BD", "00"], 92, ["0", "189", "0"]], [["7E", "BD", "7E"], 93, ["126", "189", "126"]], [["00", "81", "00"], 94, ["0", "129", "0"]], [["56", "81", "56"], 95, ["86", "129", "86"]], [["00", "68", "00"], 96, ["0", "104", "0"]], [["45", "68", "45"], 97, ["69", "104", "69"]], [["00", "4F", "00"], 98, ["0", "79", "0"]], [["35", "4F", "35"], 99, ["53", "79", "53"]], [["00", "FF", "3F"], 100, ["0", "255", "63"]], [["AA", "FF", "BF"], 101, ["170", "255", "191"]], [["00", "BD", "2E"], 102, ["0", "189", "46"]], [["7E", "BD", "8D"], 103, ["126", "189", "141"]], [["00", "81", "1F"], 104, ["0", "129", "31"]], [["56", "81", "60"], 105, ["86", "129", "96"]], [["00", "68", "19"], 106, ["0", "104", "25"]], [["45", "68", "4E"], 107, ["69", "104", "78"]], [["00", "4F", "13"], 108, ["0", "79", "19"]], [["35", "4F", "3B"], 109, ["53", "79", "59"]], [["00", "FF", "7F"], 110, ["0", "255", "127"]], [["AA", "FF", "D4"], 111, ["170", "255", "212"]], [["00", "BD", "5E"], 112, ["0", "189", "94"]], [["7E", "BD", "9D"], 113, ["126", "189", "157"]], [["00", "81", "40"], 114, ["0", "129", "64"]], [["56", "81", "6B"], 115, ["86", "129", "107"]], [["00", "68", "34"], 116, ["0", "104", "52"]], [["45", "68", "56"], 117, ["69", "104", "86"]], [["00", "4F", "27"], 118, ["0", "79", "39"]], [["35", "4F", "42"], 119, ["53", "79", "66"]], [["00", "FF", "BF"], 120, ["0", "255", "191"]], [["AA", "FF", "EA"], 121, ["170", "255", "234"]], [["00", "BD", "8D"], 122, ["0", "189", "141"]], [["7E", "BD", "AD"], 123, ["126", "189", "173"]], [["00", "81", "60"], 124, ["0", "129", "96"]], [["56", "81", "76"], 125, ["86", "129", "118"]], [["00", "68", "4E"], 126, ["0", "104", "78"]], [["45", "68", "5F"], 127, ["69", "104", "95"]], [["00", "4F", "3B"], 128, ["0", "79", "59"]], [["35", "4F", "49"], 129, ["53", "79", "73"]], [["00", "FF", "FF"], 130, ["0", "255", "255"]], [["AA", "FF", "FF"], 131, ["170", "255", "255"]], [["00", "BD", "BD"], 132, ["0", "189", "189"]], [["7E", "BD", "BD"], 133, ["126", "189", "189"]], [["00", "81", "81"], 134, ["0", "129", "129"]], [["56", "81", "81"], 135, ["86", "129", "129"]], [["00", "68", "68"], 136, ["0", "104", "104"]], [["45", "68", "68"], 137, ["69", "104", "104"]], [["00", "4F", "4F"], 138, ["0", "79", "79"]], [["35", "4F", "4F"], 139, ["53", "79", "79"]], [["00", "BF", "FF"], 140, ["0", "191", "255"]], [["AA", "EA", "FF"], 141, ["170", "234", "255"]], [["00", "8D", "BD"], 142, ["0", "141", "189"]], [["7E", "AD", "BD"], 143, ["126", "173", "189"]], [["00", "60", "81"], 144, ["0", "96", "129"]], [["56", "76", "81"], 145, ["86", "118", "129"]], [["00", "4E", "68"], 146, ["0", "78", "104"]], [["45", "5F", "68"], 147, ["69", "95", "104"]], [["00", "3B", "4F"], 148, ["0", "59", "79"]], [["35", "49", "4F"], 149, ["53", "73", "79"]], [["00", "7F", "FF"], 150, ["0", "127", "255"]], [["AA", "D4", "FF"], 151, ["170", "212", "255"]], [["00", "5E", "BD"], 152, ["0", "94", "189"]], [["7E", "9D", "BD"], 153, ["126", "157", "189"]], [["00", "40", "81"], 154, ["0", "64", "129"]], [["56", "6B", "81"], 155, ["86", "107", "129"]], [["00", "34", "68"], 156, ["0", "52", "104"]], [["45", "56", "68"], 157, ["69", "86", "104"]], [["00", "27", "4F"], 158, ["0", "39", "79"]], [["35", "42", "4F"], 159, ["53", "66", "79"]], [["00", "3F", "FF"], 160, ["0", "63", "255"]], [["AA", "BF", "FF"], 161, ["170", "191", "255"]], [["00", "2E", "BD"], 162, ["0", "46", "189"]], [["7E", "8D", "BD"], 163, ["126", "141", "189"]], [["00", "1F", "81"], 164, ["0", "31", "129"]], [["56", "60", "81"], 165, ["86", "96", "129"]], [["00", "19", "68"], 166, ["0", "25", "104"]], [["45", "4E", "68"], 167, ["69", "78", "104"]], [["00", "13", "4F"], 168, ["0", "19", "79"]], [["35", "3B", "4F"], 169, ["53", "59", "79"]], [["00", "00", "FF"], 170, ["0", "0", "255"]], [["AA", "AA", "FF"], 171, ["170", "170", "255"]], [["00", "00", "BD"], 172, ["0", "0", "189"]], [["7E", "7E", "BD"], 173, ["126", "126", "189"]], [["00", "00", "81"], 174, ["0", "0", "129"]], [["56", "56", "81"], 175, ["86", "86", "129"]], [["00", "00", "68"], 176, ["0", "0", "104"]], [["45", "45", "68"], 177, ["69", "69", "104"]], [["00", "00", "4F"], 178, ["0", "0", "79"]], [["35", "35", "4F"], 179, ["53", "53", "79"]], [["3F", "00", "FF"], 180, ["63", "0", "255"]], [["BF", "AA", "FF"], 181, ["191", "170", "255"]], [["2E", "00", "BD"], 182, ["46", "0", "189"]], [["8D", "7E", "BD"], 183, ["141", "126", "189"]], [["1F", "00", "81"], 184, ["31", "0", "129"]], [["60", "56", "81"], 185, ["96", "86", "129"]], [["19", "00", "68"], 186, ["25", "0", "104"]], [["4E", "45", "68"], 187, ["78", "69", "104"]], [["13", "00", "4F"], 188, ["19", "0", "79"]], [["3B", "35", "4F"], 189, ["59", "53", "79"]], [["7F", "00", "FF"], 190, ["127", "0", "255"]], [["D4", "AA", "FF"], 191, ["212", "170", "255"]], [["5E", "00", "BD"], 192, ["94", "0", "189"]], [["9D", "7E", "BD"], 193, ["157", "126", "189"]], [["40", "00", "81"], 194, ["64", "0", "129"]], [["6B", "56", "81"], 195, ["107", "86", "129"]], [["34", "00", "68"], 196, ["52", "0", "104"]], [["56", "45", "68"], 197, ["86", "69", "104"]], [["27", "00", "4F"], 198, ["39", "0", "79"]], [["42", "35", "4F"], 199, ["66", "53", "79"]], [["BF", "00", "FF"], 200, ["191", "0", "255"]], [["EA", "AA", "FF"], 201, ["234", "170", "255"]], [["8D", "00", "BD"], 202, ["141", "0", "189"]], [["AD", "7E", "BD"], 203, ["173", "126", "189"]], [["60", "00", "81"], 204, ["96", "0", "129"]], [["76", "56", "81"], 205, ["118", "86", "129"]], [["4E", "00", "68"], 206, ["78", "0", "104"]], [["5F", "45", "68"], 207, ["95", "69", "104"]], [["3B", "00", "4F"], 208, ["59", "0", "79"]], [["49", "35", "4F"], 209, ["73", "53", "79"]], [["FF", "00", "FF"], 210, ["255", "0", "255"]], [["FF", "AA", "FF"], 211, ["255", "170", "255"]], [["BD", "00", "BD"], 212, ["189", "0", "189"]], [["BD", "7E", "BD"], 213, ["189", "126", "189"]], [["81", "00", "81"], 214, ["129", "0", "129"]], [["81", "56", "81"], 215, ["129", "86", "129"]], [["68", "00", "68"], 216, ["104", "0", "104"]], [["68", "45", "68"], 217, ["104", "69", "104"]], [["4F", "00", "4F"], 218, ["79", "0", "79"]], [["4F", "35", "4F"], 219, ["79", "53", "79"]], [["FF", "00", "BF"], 220, ["255", "0", "191"]], [["FF", "AA", "EA"], 221, ["255", "170", "234"]], [["BD", "00", "8D"], 222, ["189", "0", "141"]], [["BD", "7E", "AD"], 223, ["189", "126", "173"]], [["81", "00", "60"], 224, ["129", "0", "96"]], [["81", "56", "76"], 225, ["129", "86", "118"]], [["68", "00", "4E"], 226, ["104", "0", "78"]], [["68", "45", "5F"], 227, ["104", "69", "95"]], [["4F", "00", "3B"], 228, ["79", "0", "59"]], [["4F", "35", "49"], 229, ["79", "53", "73"]], [["FF", "00", "7F"], 230, ["255", "0", "127"]], [["FF", "AA", "D4"], 231, ["255", "170", "212"]], [["BD", "00", "5E"], 232, ["189", "0", "94"]], [["BD", "7E", "9D"], 233, ["189", "126", "157"]], [["81", "00", "40"], 234, ["129", "0", "64"]], [["81", "56", "6B"], 235, ["129", "86", "107"]], [["68", "00", "34"], 236, ["104", "0", "52"]], [["68", "45", "56"], 237, ["104", "69", "86"]], [["4F", "00", "27"], 238, ["79", "0", "39"]], [["4F", "35", "42"], 239, ["79", "53", "66"]], [["FF", "00", "3F"], 240, ["255", "0", "63"]], [["FF", "AA", "BF"], 241, ["255", "170", "191"]], [["BD", "00", "2E"], 242, ["189", "0", "46"]], [["BD", "7E", "8D"], 243, ["189", "126", "141"]], [["81", "00", "1F"], 244, ["129", "0", "31"]], [["81", "56", "60"], 245, ["129", "86", "96"]], [["68", "00", "19"], 246, ["104", "0", "25"]], [["68", "45", "4E"], 247, ["104", "69", "78"]], [["4F", "00", "13"], 248, ["79", "0", "19"]], [["4F", "35", "3B"], 249, ["79", "53", "59"]], [["33", "33", "33"], 250, ["51", "51", "51"]], [["50", "50", "50"], 251, ["80", "80", "80"]], [["69", "69", "69"], 252, ["105", "105", "105"]], [["82", "82", "82"], 253, ["130", "130", "130"]], [["BE", "BE", "BE"], 254, ["190", "190", "190"]], [["FF", "FF", "FF"], 255, ["255", "255", "255"]]];
function Gn(s) {
  let t = "";
  const e = Xi.find(((n) => {
    const [, i] = n;
    return i === s;
  }));
  if (e) {
    const [n] = e, [i, h, o] = n;
    t = `${i}${h}${o}`;
  }
  return t;
}
a(Gn, "p");
const we = class we {
  constructor(t) {
    this.name = t, this.tags = [];
  }
  add(t, e) {
    this.tags.push({ code: t, value: e });
  }
  dxfy(t) {
    t.push(102, `{${this.name}`);
    for (const e of this.tags) t.push(e.code, e.value);
    t.push(102, "}");
  }
};
a(we, "A");
let us = we;
const Ne = class Ne {
  constructor() {
    this.lines = [];
  }
  push(t, e) {
    e != null && this.lines.push(t, e);
  }
  stringify() {
    return this.lines.join(`
`);
  }
  start(t) {
    this.push(0, "SECTION"), this.push(2, t);
  }
  end() {
    this.push(0, "ENDSEC");
  }
  variableName(t) {
    this.push(9, t);
  }
  type(t) {
    this.push(0, t);
  }
  primaryText(t) {
    this.push(1, t);
  }
  name(t, e = 2) {
    this.push(e, t);
  }
  handle(t) {
    this.push(5, t);
  }
  lineType(t) {
    this.push(6, t);
  }
  textStyle(t) {
    this.push(7, t);
  }
  layerName(t) {
    this.push(8, t);
  }
  point2d(t, e = 0) {
    this.push(10 + e, t?.x), this.push(20 + e, t?.y);
  }
  point3d(t, e = 0) {
    this.point2d(t, e), this.push(30 + e, t?.z);
  }
  elevation(t) {
    this.push(38, t);
  }
  thickness(t) {
    this.push(39, t);
  }
  visibilty(t) {
    t != null && this.push(60, t ? 0 : 1);
  }
  colorNumber(t) {
    this.push(62, t);
  }
  subclassMarker(t) {
    this.push(100, t);
  }
};
a(Ne, "y");
let cs = Ne;
var gs, It, St, g;
function p(s, t, e, n) {
  if (typeof t == "function" ? s !== t || !n : !t.has(s)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return e === "m" ? n : e === "a" ? n.call(s) : n ? n.value : t.get(s);
}
a(p, "S");
function J(s, t, e, n, i) {
  if (typeof t == "function" ? s !== t || !0 : !t.has(s)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return t.set(s, e), e;
}
a(J, "D");
function I(s, t) {
  return { code: s, value: t };
}
a(I, "b");
function zn(s, t = 255) {
  const e = [], n = [];
  for (let i = 0; i < s.length; i++) {
    const h = s[i];
    n.length === t || i === s.length - 1 ? (e.push(n.join("")), n.length = 0) : n.push(h);
  }
  return e;
}
a(zn, "E");
(function(s) {
  s[s.Red = 1] = "Red", s[s.Green = 3] = "Green", s[s.Cyan = 4] = "Cyan", s[s.Blue = 5] = "Blue", s[s.Magenta = 6] = "Magenta", s[s.White = 7] = "White", s[s.Black = 0] = "Black", s[s.Yellow = 2] = "Yellow";
})(gs || (gs = {})), (function(s) {
  s[s.Unitless = 0] = "Unitless", s[s.Inches = 1] = "Inches", s[s.Feet = 2] = "Feet", s[s.Miles = 3] = "Miles", s[s.Millimeters = 4] = "Millimeters", s[s.Centimeters = 5] = "Centimeters", s[s.Meters = 6] = "Meters", s[s.Kilometers = 7] = "Kilometers", s[s.Microinches = 8] = "Microinches", s[s.Mils = 9] = "Mils", s[s.Yards = 10] = "Yards", s[s.Angstroms = 11] = "Angstroms", s[s.Nanometers = 12] = "Nanometers", s[s.Microns = 13] = "Microns", s[s.Decimeters = 14] = "Decimeters", s[s.Decameters = 15] = "Decameters", s[s.Hectometers = 16] = "Hectometers", s[s.Gigameters = 17] = "Gigameters", s[s.AstronomicalUnits = 18] = "AstronomicalUnits", s[s.LightYears = 19] = "LightYears", s[s.Parsecs = 20] = "Parsecs", s[s.USSurveyFeet = 21] = "USSurveyFeet", s[s.USSurveyInch = 22] = "USSurveyInch", s[s.USSurveyYard = 23] = "USSurveyYard", s[s.USSurveyMile = 24] = "USSurveyMile";
})(It || (It = {})), (function(s) {
  s.Continuous = "Continuous";
})(St || (St = {})), typeof SuppressedError == "function" && SuppressedError;
const Me = class Me {
  constructor(t) {
    g.set(this, void 0), this.name = t, J(this, g, []);
  }
  clear() {
    p(this, g, "f").length = 0;
  }
  string(t) {
    zn(t).forEach(((e) => p(this, g, "f").push(I(1e3, e))));
  }
  beginList() {
    p(this, g, "f").push(I(1002, "{"));
  }
  endList() {
    p(this, g, "f").push(I(1002, "}"));
  }
  layerName(t) {
    p(this, g, "f").push(I(1003, t));
  }
  binaryData(t) {
    zn(t).forEach(((e) => p(this, g, "f").push(I(1004, e))));
  }
  databaseHandle(t) {
    p(this, g, "f").push(I(1005, t));
  }
  point(t) {
    p(this, g, "f").push(I(1010, t.x)), p(this, g, "f").push(I(1020, t.y)), p(this, g, "f").push(I(1030, t.z));
  }
  position(t) {
    p(this, g, "f").push(I(1011, t.x)), p(this, g, "f").push(I(1021, t.y)), p(this, g, "f").push(I(1031, t.z));
  }
  displacement(t) {
    p(this, g, "f").push(I(1012, t.x)), p(this, g, "f").push(I(1022, t.y)), p(this, g, "f").push(I(1032, t.z));
  }
  direction(t) {
    p(this, g, "f").push(I(1013, t.x)), p(this, g, "f").push(I(1023, t.y)), p(this, g, "f").push(I(1033, t.z));
  }
  real(t) {
    p(this, g, "f").push(I(1040, t));
  }
  distance(t) {
    p(this, g, "f").push(I(1041, t));
  }
  scale(t) {
    p(this, g, "f").push(I(1042, t));
  }
  integer(t) {
    p(this, g, "f").push(I(1070, t));
  }
  long(t) {
    p(this, g, "f").push(I(1071, t));
  }
  dxfy(t) {
    t.push(1001, this.name), t.push(1002, "{"), p(this, g, "f").forEach(((e) => t.push(e.code, e.value))), t.push(1002, "}");
  }
};
a(Me, "F");
let ps = Me;
g = /* @__PURE__ */ new WeakMap();
const Oe = class Oe {
  set angle(t) {
    this.patternsData.forEach(((e) => e.lineAngle = t));
  }
  constructor(t) {
    this.name = t, this.patternsData = [], this.scale = 1;
  }
  dxfy(t) {
    t.push(78, this.patternsData.length);
    for (const e of this.patternsData) {
      t.push(53, e.lineAngle), t.push(43, e.x), t.push(44, e.y), t.push(45, e.offsetX * this.scale), t.push(46, e.offsetY * this.scale), t.push(79, e.dashLengthItems.length);
      for (const n of e.dashLengthItems) t.push(49, n * this.scale);
    }
  }
  add(t) {
    this.patternsData.push(t);
  }
};
a(Oe, "C");
let d = Oe;
const l = /* @__PURE__ */ new Map(), Tt = new d("ANGLE");
Tt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0.275, offsetY: 0.2, dashLengthItems: [-0.075] }), Tt.add({ lineAngle: 90, x: 0, y: 0, offsetX: 0.275, offsetY: 0.2, dashLengthItems: [-0.075] }), l.set("ANGLE", Tt);
const Jn = new d("ANSI31");
Jn.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 1.25, dashLengthItems: [] }), l.set("ANSI31", Jn);
const Kn = new d("ANSI32");
Kn.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), l.set("ANSI32", Kn);
const Bt = new d("ANSI33");
Bt.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 9.525, dashLengthItems: [] }), Bt.add({ lineAngle: 45, x: 4.49013, y: 0, offsetX: 0, offsetY: 9.525, dashLengthItems: [] }), l.set("ANSI33", Bt);
const wt = new d("ANSI34");
wt.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), wt.add({ lineAngle: 45, x: 4.49013, y: 0, offsetX: 0, offsetY: 6.35, dashLengthItems: [3.175, -1.5875] }), l.set("ANSI34", wt);
const W = new d("ANSI35");
W.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 19.05, dashLengthItems: [] }), W.add({ lineAngle: 45, x: 4.49013, y: 0, offsetX: 0, offsetY: 19.05, dashLengthItems: [] }), W.add({ lineAngle: 45, x: 8.98026, y: 0, offsetX: 0, offsetY: 19.05, dashLengthItems: [] }), W.add({ lineAngle: 45, x: 13.4704, y: 0, offsetX: 0, offsetY: 19.05, dashLengthItems: [] }), l.set("ANSI35", W);
const Nt = new d("ANSI36");
Nt.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), Nt.add({ lineAngle: 45, x: 4.49013, y: 0, offsetX: 0, offsetY: 6.35, dashLengthItems: [7.9375, -1.5875, 0, -1.5875] }), l.set("ANSI36", Nt);
const Zn = new d("ANSI37");
Zn.add({ lineAngle: 45, x: 0, y: 0, offsetX: 5.55625, offsetY: 3.175, dashLengthItems: [7.9375, -1.5875, 0, -1.5875] }), l.set("ANSI37", Zn);
const Mt = new d("ANSI38");
Mt.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), Mt.add({ lineAngle: 135, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), l.set("ANSI38", Mt);
const Ot = new d("AR_B816");
Ot.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), Ot.add({ lineAngle: 135, x: 0, y: 0, offsetX: 6.35, offsetY: 3.175, dashLengthItems: [7.9375, -4.7625] }), l.set("AR_B816", Ot);
const Pt = new d("AR_B816C");
Pt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 203.2, dashLengthItems: [] }), Pt.add({ lineAngle: 90, x: 0, y: 0, offsetX: 203.2, offsetY: 203.2, dashLengthItems: [203.2, -203.2] }), l.set("AR_B816C", Pt);
const V = new d("AR_B88");
V.add({ lineAngle: 0, x: 0, y: 0, offsetX: 203.2, offsetY: 203.2, dashLengthItems: [396.875, -9.525] }), V.add({ lineAngle: 0, x: -203.2, y: 9.525, offsetX: 203.2, offsetY: 203.2, dashLengthItems: [396.875, -9.525] }), V.add({ lineAngle: 90, x: 0, y: 0, offsetX: 203.2, offsetY: 203.2, dashLengthItems: [-212.725, 193.675] }), V.add({ lineAngle: 90, x: -9.525, y: 0, offsetX: 203.2, offsetY: 203.2, dashLengthItems: [-212.725, 193.675] }), l.set("AR_B88", V);
const _t = new d("AR_BRELM");
_t.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 203.2, dashLengthItems: [] }), _t.add({ lineAngle: 90, x: 0, y: 0, offsetX: 203.2, offsetY: 101.6, dashLengthItems: [203.2, -203.2] }), l.set("AR_BRELM", _t);
const T = new d("AR_BRSTD");
T.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 135.484, dashLengthItems: [193.675, -9.525] }), T.add({ lineAngle: 0, x: 0, y: 57.15, offsetX: 0, offsetY: 135.484, dashLengthItems: [193.675, -9.525] }), T.add({ lineAngle: 0, x: 50.8, y: 67.7418, offsetX: 0, offsetY: 135.484, dashLengthItems: [92.075, -9.525] }), T.add({ lineAngle: 0, x: 50.8, y: 124.892, offsetX: 0, offsetY: 135.484, dashLengthItems: [92.075, -9.525] }), T.add({ lineAngle: 90, x: 0, y: 0, offsetX: 0, offsetY: 203.2, dashLengthItems: [57.15, -78.334] }), T.add({ lineAngle: 90, x: -9.525, y: 0, offsetX: 0, offsetY: 203.2, dashLengthItems: [57.15, -78.334] }), T.add({ lineAngle: 90, x: 50.8, y: 67.7418, offsetX: 0, offsetY: 101.6, dashLengthItems: [57.15, -78.334] }), T.add({ lineAngle: 90, x: 41.275, y: 67.7418, offsetX: 0, offsetY: 101.6, dashLengthItems: [57.15, -78.334] }), l.set("AR_BRSTD", T);
const Ht = new d("AR_CONC");
Ht.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 67.7418, dashLengthItems: [] }), Ht.add({ lineAngle: 90, x: 0, y: 0, offsetX: 67.7418, offsetY: 101.6, dashLengthItems: [67.7418, -67.7418] }), l.set("AR_CONC", Ht);
const v = new d("AR_HBONE");
v.add({ lineAngle: 50, x: 0, y: 0, offsetX: 104.896, offsetY: -149.807, dashLengthItems: [19.05, -209.55] }), v.add({ lineAngle: 355, x: 0, y: 0, offsetX: -51.76101082, offsetY: 187.25814969, dashLengthItems: [15.24, -167.64058417] }), v.add({ lineAngle: 100.4514447, x: 15.182007, y: -1.3282535, offsetX: 145.5569059, offsetY: -176.270089, dashLengthItems: [16.1900088, -178.0902446] }), v.add({ lineAngle: 46.1842, x: 0, y: 50.8, offsetX: 157.343, offsetY: -224.71, dashLengthItems: [28.575, -314.325] }), v.add({ lineAngle: 96.63555761, x: 22.5899, y: 47.2965, offsetX: 218.33577212, offsetY: -264.40480444, dashLengthItems: [24.28502314, -267.13560816] }), v.add({ lineAngle: 351.18415117, x: 0, y: 50.8, offsetX: 196.67912063, offsetY: 280.88740361, dashLengthItems: [22.85996707, -251.45973192] }), v.add({ lineAngle: 21, x: 25.4, y: 38.1, offsetX: 104.89565868, offsetY: -149.80652586, dashLengthItems: [19.05, -209.55] }), v.add({ lineAngle: 326, x: 25.4, y: 38.1, offsetX: -51.7604, offsetY: 187.258, dashLengthItems: [15.24, -167.64] }), v.add({ lineAngle: 71.451445, x: 38.0345326, y: 29.5779001, offsetX: 145.5567546, offsetY: -176.2700748, dashLengthItems: [16.1900088, -178.0899376] }), v.add({ lineAngle: 37.5, x: 0, y: 0, offsetX: 53.9242, offsetY: 65.2018, dashLengthItems: [0, -165.608, 0, -170.18, 0, -168.275] }), v.add({ lineAngle: 7.5, x: 0, y: 0, offsetX: 79.3242, offsetY: 90.6018, dashLengthItems: [0, -97.028, 0, -161.798, 0, -64.135] }), v.add({ lineAngle: -32.5, x: -56.642, y: 0, offsetX: 117.434, offsetY: 68.0212, dashLengthItems: [0, -63.5, 0, -198.12, 0, -262.89] }), v.add({ lineAngle: -42.5, x: -82.042, y: 0, offsetX: 92.0344, offsetY: 118.821, dashLengthItems: [0, -82.55, 0, -131.572, 0, -186.69] }), l.set("AR_HBONE", v);
const kt = new d("AR_PARQ1");
kt.add({ lineAngle: 45, x: 0, y: 0, offsetX: 101.6, offsetY: 101.6, dashLengthItems: [304.8, -101.6] }), kt.add({ lineAngle: 135, x: 71.842, y: 71.842, offsetX: 101.6, offsetY: -101.6, dashLengthItems: [304.8, -101.6] }), l.set("AR_PARQ1", kt);
const b = new d("AR_RROOF");
b.add({ lineAngle: 90, x: 0, y: 0, offsetX: 304.8, offsetY: 304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 90, x: 50.8, y: 0, offsetX: 304.8, offsetY: 304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 90, x: 101.6, y: 0, offsetX: 304.8, offsetY: 304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 90, x: 152.4, y: 0, offsetX: 304.8, offsetY: 304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 90, x: 203.2, y: 0, offsetX: 304.8, offsetY: 304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 90, x: 254, y: 0, offsetX: 304.8, offsetY: 304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 90, x: 304.8, y: 0, offsetX: 304.8, offsetY: 304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 0, x: 0, y: 304.8, offsetX: 304.8, offsetY: -304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 0, x: 0, y: 355.6, offsetX: 304.8, offsetY: -304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 0, x: 0, y: 406.4, offsetX: 304.8, offsetY: -304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 0, x: 0, y: 457.2, offsetX: 304.8, offsetY: -304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 0, x: 0, y: 508, offsetX: 304.8, offsetY: -304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 0, x: 0, y: 558.8, offsetX: 304.8, offsetY: -304.8, dashLengthItems: [304.8, -304.8] }), b.add({ lineAngle: 0, x: 0, y: 609.6, offsetX: 304.8, offsetY: -304.8, dashLengthItems: [304.8, -304.8] }), l.set("AR_RROOF", b);
const et = new d("AR_RSHKE");
et.add({ lineAngle: 0, x: 0, y: 0, offsetX: 55.88, offsetY: 25.4, dashLengthItems: [381, -50.8, 127, -25.4] }), et.add({ lineAngle: 0, x: 33.782, y: 12.7, offsetX: -25.4, offsetY: 33.782, dashLengthItems: [76.2, -8.382, 152.4, -19.05] }), et.add({ lineAngle: 0, x: 12.7, y: 21.59, offsetX: 132.08, offsetY: 17.018, dashLengthItems: [203.2, -35.56, 101.6, -25.4] }), l.set("AR_RSHKE", et);
const R = new d("AR_SAND");
R.add({ lineAngle: 0, x: 0, y: 0, offsetX: 647.7, offsetY: 304.8, dashLengthItems: [152.4, -127, 177.8, -76.2, 228.6, -101.6] }), R.add({ lineAngle: 0, x: 152.4, y: 12.7, offsetX: 647.7, offsetY: 304.8, dashLengthItems: [127, -482.6, 101.6, -152.4] }), R.add({ lineAngle: 0, x: 457.2, y: -19.05, offsetX: 647.7, offsetY: 304.8, dashLengthItems: [76.2, -787.4] }), R.add({ lineAngle: 90, x: 0, y: 0, offsetX: 304.8, offsetY: 215.9, dashLengthItems: [292.1, -927.1] }), R.add({ lineAngle: 90, x: 152.4, y: 0, offsetX: 304.8, offsetY: 215.9, dashLengthItems: [285.75, -933.45] }), R.add({ lineAngle: 90, x: 279.4, y: 0, offsetX: 304.8, offsetY: 215.9, dashLengthItems: [266.7, -952.5] }), R.add({ lineAngle: 90, x: 457.2, y: -19.05, offsetX: 304.8, offsetY: 215.9, dashLengthItems: [292.1, -927.1] }), R.add({ lineAngle: 90, x: 533.4, y: -19.05, offsetX: 304.8, offsetY: 215.9, dashLengthItems: [292.1, -927.1] }), R.add({ lineAngle: 90, x: 762, y: 0, offsetX: 304.8, offsetY: 215.9, dashLengthItems: [279.4, -939.8] }), l.set("AR_SAND", R);
const U = new d("BOX");
U.add({ lineAngle: 37.5, x: 0, y: 0, offsetX: 28.5242, offsetY: 39.8018, dashLengthItems: [0, -38.608, 0, -43.18, 0, -41.275] }), U.add({ lineAngle: 7.5, x: 0, y: 0, offsetX: 53.9242, offsetY: 65.2018, dashLengthItems: [0, -20.828, 0, -34.798, 0, -13.335] }), U.add({ lineAngle: -32.5, x: -31.242, y: 0, offsetX: 66.6344, offsetY: 42.6212, dashLengthItems: [0, -12.7, 0, -45.72, 0, -59.69] }), U.add({ lineAngle: -42.5, x: -31.242, y: 0, offsetX: 41.2344, offsetY: 68.0212, dashLengthItems: [0, -6.35, 0, -29.972, 0, -34.29] }), l.set("BOX", U);
const B = new d("BRASS");
B.add({ lineAngle: 90, x: 0, y: 0, offsetX: 0, offsetY: 25.4, dashLengthItems: [] }), B.add({ lineAngle: 90, x: 6.35, y: 0, offsetX: 0, offsetY: 25.4, dashLengthItems: [] }), B.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 25.4, dashLengthItems: [-6.35, 6.35] }), B.add({ lineAngle: 0, x: 0, y: 6.35, offsetX: 0, offsetY: 25.4, dashLengthItems: [-6.35, 6.35] }), B.add({ lineAngle: 0, x: 0, y: 12.7, offsetX: 0, offsetY: 25.4, dashLengthItems: [6.35, -6.35] }), B.add({ lineAngle: 0, x: 0, y: 19.05, offsetX: 0, offsetY: 25.4, dashLengthItems: [6.35, -6.35] }), B.add({ lineAngle: 90, x: 12.7, y: 0, offsetX: 0, offsetY: 25.4, dashLengthItems: [6.35, -6.35] }), B.add({ lineAngle: 90, x: 19.05, y: 0, offsetX: 0, offsetY: 25.4, dashLengthItems: [6.35, -6.35] }), l.set("BRASS", B);
const Wt = new d("BRICK");
Wt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), Wt.add({ lineAngle: 0, x: 0, y: 3.175, offsetX: 0, offsetY: 6.35, dashLengthItems: [3.175, -1.5875] }), l.set("BRICK", Wt);
const nt = new d("BRSTONE");
nt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), nt.add({ lineAngle: 90, x: 0, y: 0, offsetX: 0, offsetY: 12.7, dashLengthItems: [6.35, -6.35] }), nt.add({ lineAngle: 90, x: 6.35, y: 0, offsetX: 0, offsetY: 12.7, dashLengthItems: [-6.35, 6.35] }), l.set("BRSTONE", nt);
const w = new d("CLAY");
w.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 8.382, dashLengthItems: [] }), w.add({ lineAngle: 90, x: 22.86, y: 0, offsetX: 8.382, offsetY: 12.7, dashLengthItems: [8.382, -8.382] }), w.add({ lineAngle: 90, x: 20.32, y: 0, offsetX: 8.382, offsetY: 12.7, dashLengthItems: [8.382, -8.382] }), w.add({ lineAngle: 0, x: 22.86, y: 1.397, offsetX: 12.7, offsetY: 8.382, dashLengthItems: [-22.86, 2.54] }), w.add({ lineAngle: 0, x: 22.86, y: 2.794, offsetX: 12.7, offsetY: 8.382, dashLengthItems: [-22.86, 2.54] }), w.add({ lineAngle: 0, x: 22.86, y: 4.191, offsetX: 12.7, offsetY: 8.382, dashLengthItems: [-22.86, 2.54] }), w.add({ lineAngle: 0, x: 22.86, y: 5.588, offsetX: 12.7, offsetY: 8.382, dashLengthItems: [-22.86, 2.54] }), w.add({ lineAngle: 0, x: 22.86, y: 6.985, offsetX: 12.7, offsetY: 8.382, dashLengthItems: [-22.86, 2.54] }), l.set("CLAY", w);
const j = new d("CORK");
j.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 4.7625, dashLengthItems: [] }), j.add({ lineAngle: 0, x: 0, y: 0.79375, offsetX: 0, offsetY: 4.7625, dashLengthItems: [] }), j.add({ lineAngle: 0, x: 0, y: 1.5875, offsetX: 0, offsetY: 4.7625, dashLengthItems: [] }), j.add({ lineAngle: 0, x: 0, y: 3.175, offsetX: 0, offsetY: 4.7625, dashLengthItems: [4.7625, -3.175] }), l.set("CORK", j);
const G = new d("CROSS");
G.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), G.add({ lineAngle: 135, x: 1.5875, y: -1.5875, offsetX: 0, offsetY: 8.98026, dashLengthItems: [4.49013, -4.49013] }), G.add({ lineAngle: 135, x: 2.38125, y: -1.5875, offsetX: 0, offsetY: 8.98026, dashLengthItems: [4.49013, -4.49013] }), G.add({ lineAngle: 135, x: 3.175, y: -1.5875, offsetX: 0, offsetY: 8.98026, dashLengthItems: [4.49013, -4.49013] }), l.set("CROSS", G);
const Vt = new d("DASH");
Vt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 6.35, offsetY: 6.35, dashLengthItems: [3.175, -9.525] }), Vt.add({ lineAngle: 90, x: 1.5875, y: -1.5875, offsetX: 6.35, offsetY: 6.35, dashLengthItems: [3.175, -9.525] }), l.set("DASH", Vt);
const qn = new d("DOLMIT");
qn.add({ lineAngle: 0, x: 0, y: 0, offsetX: 3.175, offsetY: 3.175, dashLengthItems: [3.175, -3.175] }), l.set("DOLMIT", qn);
const Ut = new d("DOTS");
Ut.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), Ut.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 17.9605, dashLengthItems: [8.980256121069154, -17.960512242138307] }), l.set("DOTS", Ut);
const $n = new d("EARTH");
$n.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0.79375, offsetY: 1.5875, dashLengthItems: [0, -1.5875] }), l.set("EARTH", $n);
const _ = new d("ESCHER");
_.add({ lineAngle: 0, x: 0, y: 0, offsetX: 6.35, offsetY: 6.35, dashLengthItems: [6.35, -6.35] }), _.add({ lineAngle: 0, x: 0, y: 2.38125, offsetX: 6.35, offsetY: 6.35, dashLengthItems: [6.35, -6.35] }), _.add({ lineAngle: 0, x: 0, y: 4.7625, offsetX: 6.35, offsetY: 6.35, dashLengthItems: [6.35, -6.35] }), _.add({ lineAngle: 90, x: 0.79375, y: 5.55625, offsetX: 6.35, offsetY: 6.35, dashLengthItems: [6.35, -6.35] }), _.add({ lineAngle: 90, x: 3.175, y: 5.55625, offsetX: 6.35, offsetY: 6.35, dashLengthItems: [6.35, -6.35] }), _.add({ lineAngle: 90, x: 5.55625, y: 5.55625, offsetX: 6.35, offsetY: 6.35, dashLengthItems: [6.35, -6.35] }), l.set("ESCHER", _);
const L = new d("FLEX");
L.add({ lineAngle: 60, x: 0, y: 0, offsetX: -15.24, offsetY: 26.3964542936, dashLengthItems: [27.94, -2.54] }), L.add({ lineAngle: 180, x: 0, y: 0, offsetX: -15.24, offsetY: 26.3964542936, dashLengthItems: [27.94, -2.54] }), L.add({ lineAngle: 300, x: 0, y: 0, offsetX: 15.24, offsetY: 26.3964542936, dashLengthItems: [27.94, -2.54] }), L.add({ lineAngle: 60, x: 2.54, y: 0, offsetX: -15.24, offsetY: 26.3964542936, dashLengthItems: [5.08, -25.4] }), L.add({ lineAngle: 300, x: 2.54, y: 0, offsetX: 15.24, offsetY: 26.3964542936, dashLengthItems: [5.08, -25.4] }), L.add({ lineAngle: 60, x: -1.27, y: 2.199704516, offsetX: -15.24, offsetY: 26.3964542936, dashLengthItems: [5.08, -25.4] }), L.add({ lineAngle: 180, x: -1.27, y: 2.199704516, offsetX: -15.24, offsetY: 26.3964542936, dashLengthItems: [5.08, -25.4] }), L.add({ lineAngle: 300, x: -1.27, y: -2.199704516, offsetX: 15.24, offsetY: 26.3964542936, dashLengthItems: [5.08, -25.4] }), L.add({ lineAngle: 180, x: -1.27, y: -2.199704516, offsetX: -15.24, offsetY: 26.3964542936, dashLengthItems: [5.08, -25.4] }), L.add({ lineAngle: 60, x: -10.16, y: 0, offsetX: -15.24, offsetY: 26.3964542936, dashLengthItems: [5.08, -25.4] }), L.add({ lineAngle: 300, x: -10.16, y: 0, offsetX: 15.24, offsetY: 26.3964542936, dashLengthItems: [5.08, -25.4] }), L.add({ lineAngle: 60, x: 5.08, y: -8.7988180894, offsetX: -15.24, offsetY: 26.3964542936, dashLengthItems: [5.08, -25.4] }), L.add({ lineAngle: 180, x: 5.08, y: -8.7988180894, offsetX: -15.24, offsetY: 26.3964542936, dashLengthItems: [5.08, -25.4] }), L.add({ lineAngle: 300, x: 5.08, y: 8.7988180894, offsetX: 15.24, offsetY: 26.3964542936, dashLengthItems: [5.08, -25.4] }), L.add({ lineAngle: 180, x: 5.08, y: 8.7988180894, offsetX: -15.24, offsetY: 26.3964542936, dashLengthItems: [5.08, -25.4] }), L.add({ lineAngle: 0, x: 5.08, y: 4.3994090574, offsetX: -15.24, offsetY: 26.3964542936, dashLengthItems: [17.78, -12.7] }), L.add({ lineAngle: 0, x: 5.08, y: -4.3994090574, offsetX: -15.24, offsetY: 26.3964542936, dashLengthItems: [17.78, -12.7] }), L.add({ lineAngle: 120, x: 1.27, y: 6.5991135734, offsetX: 15.24, offsetY: 26.3964542936, dashLengthItems: [17.78, -12.7] }), L.add({ lineAngle: 120, x: -6.35, y: 2.199704516, offsetX: 15.24, offsetY: 26.3964542936, dashLengthItems: [17.78, -12.7] }), L.add({ lineAngle: 240, x: -6.35, y: -2.199704516, offsetX: 15.24, offsetY: 26.3964542936, dashLengthItems: [17.78, -12.7] }), L.add({ lineAngle: 240, x: 1.27, y: -6.5991135734, offsetX: 15.24, offsetY: 26.3964542936, dashLengthItems: [17.78, -12.7] }), l.set("FLEX", L);
const jt = new d("GOST_GLASS");
jt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 6.35, dashLengthItems: [6.35, -6.35] }), jt.add({ lineAngle: 45, x: 6.35, y: 0, offsetX: 4.490128053, offsetY: 4.490128053, dashLengthItems: [1.5875, -5.8052561314, 1.5875, -8.9802561314] }), l.set("GOST_GLASS", jt);
const it = new d("GOST_WOOD");
it.add({ lineAngle: 45, x: 0, y: 0, offsetX: 6, offsetY: -6, dashLengthItems: [5, -7] }), it.add({ lineAngle: 45, x: 2.12132, y: 0, offsetX: 6, offsetY: -6, dashLengthItems: [2, -10] }), it.add({ lineAngle: 45, x: 0, y: 2.12132, offsetX: 6, offsetY: -6, dashLengthItems: [2, -10] }), l.set("GOST_WOOD", it);
const ht = new d("GOST_GROUND");
ht.add({ lineAngle: 90, x: 0, y: 0, offsetX: 0, offsetY: -6, dashLengthItems: [10, -2] }), ht.add({ lineAngle: 90, x: 2, y: -2, offsetX: 0, offsetY: -6, dashLengthItems: [6, -1.5, 3, -1.5] }), ht.add({ lineAngle: 90, x: 4, y: -5, offsetX: 0, offsetY: -6, dashLengthItems: [10, -2] }), l.set("GOST_GROUND", ht);
const ot = new d("GRASS");
ot.add({ lineAngle: 45, x: 0, y: 0, offsetX: 10, offsetY: -10, dashLengthItems: [20] }), ot.add({ lineAngle: 45, x: 3, y: 0, offsetX: 10, offsetY: -10, dashLengthItems: [20] }), ot.add({ lineAngle: 45, x: 6, y: 0, offsetX: 10, offsetY: -10, dashLengthItems: [20] }), l.set("GRASS", ot);
const dt = new d("GRATE");
dt.add({ lineAngle: 90, x: 0, y: 0, offsetX: 17.96051224, offsetY: 17.96051224, dashLengthItems: [4.7625, -31.15852448] }), dt.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 25.4, dashLengthItems: [4.7625, -20.6375] }), dt.add({ lineAngle: 135, x: 0, y: 0, offsetX: 0, offsetY: 25.4, dashLengthItems: [4.7625, -20.6375] }), l.set("GRATE", dt);
const Gt = new d("GRAVEL");
Gt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 0.79375, dashLengthItems: [] }), Gt.add({ lineAngle: 90, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), l.set("GRAVEL", Gt);
const u = new d("HEX");
u.add({ lineAngle: 228.0127875, x: 18.288, y: 25.4, offsetX: 305.85067529778, offsetY: 1.88796713245, dashLengthItems: [3.4172144, -338.30483639565] }), u.add({ lineAngle: 184.969741, x: 16.002, y: 22.86, offsetX: -305.8545235377, offsetY: 1.10019612724, dashLengthItems: [5.8640472, -580.54048893524] }), u.add({ lineAngle: 132.5104471, x: 10.16, y: 22.352, offsetX: -377.59492241548, offsetY: 1.56030959675, dashLengthItems: [4.1348152, -409.347227941] }), u.add({ lineAngle: 267.273689, x: 0.254, y: 16.002, offsetX: -508.63316875916, offsetY: 1.20815479432, dashLengthItems: [5.3400452, -528.66437425738] }), u.add({ lineAngle: 292.83365418, x: 0, y: 10.668, offsetX: -330.19770134945, offsetY: 1.23208097566, dashLengthItems: [5.236337, -518.39807745344] }), u.add({ lineAngle: 357.273689, x: 2.032, y: 5.842, offsetX: -508.63316875916, offsetY: 1.20815479432, dashLengthItems: [5.3400452, -528.66437425738] }), u.add({ lineAngle: 37.69424047, x: 7.366, y: 5.588, offsetX: -416.58997273292, offsetY: 0.91357450169, dashLengthItems: [7.0619366, -699.13115314247] }), u.add({ lineAngle: 72.25532837, x: 12.954, y: 9.906, offsetX: 586.40373773403, offsetY: 0.96766293399, dashLengthItems: [6.6671952, -660.05256601905] }), u.add({ lineAngle: 121.42956562, x: 14.986, y: 16.256, offsetX: 387.71230339293, offsetY: 1.2040754753, dashLengthItems: [5.35813, -530.45545698712] }), u.add({ lineAngle: 175.2363583, x: 12.192, y: 20.828, offsetX: -280.5442400419, offsetY: 2.10935518695, dashLengthItems: [6.1171328, -299.7393695] }), u.add({ lineAngle: 222.3974378, x: 6.096, y: 21.336, offsetX: 413.48123885686, offsetY: 0.81554484621, dashLengthItems: [7.9107792, -783.16772512177] }), u.add({ lineAngle: 138.81407483, x: 25.4, y: 15.748, offsetX: 234.164238558, offsetY: 2.38943100688, dashLengthItems: [2.7000454, -267.30565824344] }), u.add({ lineAngle: 171.4692344, x: 23.368, y: 17.526, offsetX: -334.082478726, offsetY: 1.25594916784, dashLengthItems: [5.1368198, -508.5463899704] }), u.add({ lineAngle: 225, x: 18.288, y: 18.288, offsetX: 17.96051224214, offsetY: 17.96051224214, dashLengthItems: [3.5920934, -32.32893108428] }), u.add({ lineAngle: 203.19859051, x: 16.51, y: 21.336, offsetX: -136.74251918, offsetY: 3.33518339548, dashLengthItems: [1.9344132, -191.50622368894] }), u.add({ lineAngle: 291.80140949, x: 14.732, y: 20.574, offsetX: -80.18324702488, offsetY: 4.71666158921, dashLengthItems: [2.7356562, -134.0475299] }), u.add({ lineAngle: 30.96375653, x: 15.748, y: 18.034, offsetX: 91.47734531502, offsetY: 4.35606406258, dashLengthItems: [4.4431966, -143.6629815291] }), u.add({ lineAngle: 161.56505118, x: 19.558, y: 20.32, offsetX: -56.2252967978, offsetY: 8.03218525675, dashLengthItems: [3.2128714, -77.10898116828] }), u.add({ lineAngle: 16.389540334, x: 0, y: 20.574, offsetX: 265.17991128726, offsetY: 1.43340492604, dashLengthItems: [4.50088, -445.58826672539] }), u.add({ lineAngle: 70.34617594, x: 4.318, y: 21.844, offsetX: -297.29446803469, offsetY: 1.70858889651, dashLengthItems: [3.7759894, -373.822156782] }), u.add({ lineAngle: 293.19859051, x: 19.558, y: 25.4, offsetX: -136.7425191801, offsetY: 3.33518339548, dashLengthItems: [3.868801, -189.57183588894] }), u.add({ lineAngle: 343.61045967, x: 21.082, y: 21.844, offsetX: -265.17991128725, offsetY: 1.433404926, dashLengthItems: [4.50088, -445.5882667254] }), u.add({ lineAngle: 339.44395478, x: 0, y: 4.826, offsetX: -136.75087638398, offsetY: 2.97284513779, dashLengthItems: [4.340352, -212.67734313106] }), u.add({ lineAngle: 294.7751406, x: 4.064, y: 3.302, offsetX: -306.90424056705, offsetY: 1.77401295215, dashLengthItems: [3.6367212, -360.0359338072] }), u.add({ lineAngle: 66.80140949, x: 19.812, y: 0, offsetX: 136.74251918012, offsetY: 3.33518339452, dashLengthItems: [3.868801, -189.57183588894] }), u.add({ lineAngle: 17.35402464, x: 21.336, y: 3.556, offsetX: -345.47402804977, offsetY: 1.51523696536, dashLengthItems: [4.2578274, -421.523759802] }), u.add({ lineAngle: 69.44395478, x: 7.366, y: 0, offsetX: -136.75087638396, offsetY: 2.97284513874, dashLengthItems: [2.170176, -214.84751913106] }), u.add({ lineAngle: 101.309932474, x: 18.288, y: 0, offsetX: 104.60834648271, offsetY: 4.98134983255, dashLengthItems: [1.295146, -128.21994964526] }), u.add({ lineAngle: 165.963756532, x: 18.034, y: 1.27, offsetX: -80.085263387, offsetY: 6.16040487582, dashLengthItems: [5.236337, -99.49054589069] }), u.add({ lineAngle: 186.00900596, x: 12.954, y: 2.54, offsetX: -255.26337856879, offsetY: 1.32949676118, dashLengthItems: [4.85267, -480.41364863337] }), u.add({ lineAngle: 303.69006753, x: 15.748, y: 15.748, offsetX: -56.35753993648, offsetY: 7.0446924921, dashLengthItems: [3.6632388, -87.9177635968] }), u.add({ lineAngle: 353.15722659, x: 17.78, y: 12.7, offsetX: 434.77679606606, offsetY: 1.0087628707, dashLengthItems: [6.3955676, -633.16009065031] }), u.add({ lineAngle: 60.9453959, x: 24.13, y: 11.938, offsetX: -204.76648550216, offsetY: 2.46706609031, dashLengthItems: [2.6150824, -258.8939231811] }), u.add({ lineAngle: 90, x: 25.4, y: 14.224, offsetX: 25.4, offsetY: 25.4, dashLengthItems: [1.524, -23.876] }), u.add({ lineAngle: 120.25643716, x: 12.446, y: 3.302, offsetX: -204.77318477297, offsetY: 1.8283320086, dashLengthItems: [3.5286696, -349.339407732] }), u.add({ lineAngle: 48.0127875, x: 10.668, y: 6.35, offsetX: 305.85067529778, offsetY: 1.88796713138, dashLengthItems: [6.8344288, -334.88762199565] }), u.add({ lineAngle: 0, x: 15.24, y: 11.43, offsetX: 25.4, offsetY: 25.4, dashLengthItems: [6.604, -18.796] }), u.add({ lineAngle: 325.3048465, x: 21.844, y: 11.43, offsetX: 310.04235091354, offsetY: -1.6064370526, dashLengthItems: [4.0160956, -397.5931672414] }), u.add({ lineAngle: 254.0546041, x: 25.146, y: 9.144, offsetX: 104.6687497289, offsetY: 3.48895832444, dashLengthItems: [3.6982908, -181.21650038772] }), u.add({ lineAngle: 207.64597536, x: 24.13, y: 5.588, offsetX: 545.36007557253, offsetY: 1.07143433066, dashLengthItems: [6.021451, -596.12464422938] }), u.add({ lineAngle: 175.42607874, x: 18.796, y: 2.794, offsetX: 331.1739336186, offsetY: 1.01276432357, dashLengthItems: [6.3702946, -630.6584645624] }), l.set("HEX", u);
const at = new d("HONEY");
at.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5.4992613154, dashLengthItems: [3.175, -6.35] }), at.add({ lineAngle: 120, x: 0, y: 0, offsetX: 0, offsetY: 5.4992613154, dashLengthItems: [3.175, -6.35] }), at.add({ lineAngle: 60, x: 3.175, y: 0, offsetX: 0, offsetY: 5.4992613154, dashLengthItems: [3.175, -6.35] }), l.set("HONEY", at);
const lt = new d("HOUND");
lt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 4.7625, offsetY: 2.749630645, dashLengthItems: [3.175, -6.35] }), lt.add({ lineAngle: 120, x: 0, y: 0, offsetX: 4.7625, offsetY: 2.749630645, dashLengthItems: [3.175, -6.35] }), lt.add({ lineAngle: 60, x: 0, y: 0, offsetX: 4.7625, offsetY: 2.749630645, dashLengthItems: [-6.35, 3.175] }), l.set("HOUND", lt);
const zt = new d("INSUL");
zt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 6.35, offsetY: 1.5875, dashLengthItems: [25.4, -12.7] }), zt.add({ lineAngle: 90, x: 0, y: 0, offsetX: -6.35, offsetY: 1.5875, dashLengthItems: [25.4, -12.7] }), l.set("INSUL", zt);
const rt = new d("ACAD_ISO02W100");
rt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 9.525, dashLengthItems: [] }), rt.add({ lineAngle: 0, x: 0, y: 3.175, offsetX: 0, offsetY: 9.525, dashLengthItems: [3.175, -3.175] }), rt.add({ lineAngle: 0, x: 0, y: 6.35, offsetX: 0, offsetY: 9.525, dashLengthItems: [3.175, -3.175] }), l.set("ACAD_ISO02W100", rt);
const Qn = new d("ACAD_ISO03W100");
Qn.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [12, -3] }), l.set("ACAD_ISO03W100", Qn);
const ti = new d("ACAD_ISO04W100");
ti.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [12, -18] }), l.set("ACAD_ISO04W100", ti);
const si = new d("ACAD_ISO05W100");
si.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [24, -3, 0.5, -3] }), l.set("ACAD_ISO05W100", si);
const ei = new d("ACAD_ISO06W100");
ei.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [24, -3, 0.5, -3, 0.5, -3] }), l.set("ACAD_ISO06W100", ei);
const Jt = new d("ACAD_ISO07W100");
Jt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [24, -3, 0.5, -3, 0.5, -6.5] }), Jt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [-34, 0.5, -3] }), l.set("ACAD_ISO07W100", Jt);
const ni = new d("ACAD_ISO08W100");
ni.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [0.5, -3] }), l.set("ACAD_ISO08W100", ni);
const ii = new d("ACAD_ISO09W100");
ii.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [24, -3, 6, -3] }), l.set("ACAD_ISO09W100", ii);
const hi = new d("ACAD_ISO10W100");
hi.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [24, -3, 6, -3, 6, -3] }), l.set("ACAD_ISO10W100", hi);
const oi = new d("ACAD_ISO11W100");
oi.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [12, -3, 0.5, -3] }), l.set("ACAD_ISO11W100", oi);
const di = new d("ACAD_ISO12W100");
di.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [12, -3, 12, -3, 0.5, -3] }), l.set("ACAD_ISO12W100", di);
const ai = new d("ACAD_ISO13W100");
ai.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [12, -3, 0.5, -3, 0.5, -3] }), l.set("ACAD_ISO13W100", ai);
const Kt = new d("ACAD_ISO14W100");
Kt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [12, -3, 12, -3, 0.5, -6.5] }), Kt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [-33.5, 0.5, -3] }), l.set("ACAD_ISO14W100", Kt);
const Zt = new d("ACAD_ISO15W100");
Zt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [12, -3, 0.5, -3, 0.5, -6.5] }), Zt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [-22, 0.5, -3] }), l.set("ACAD_ISO15W100", Zt);
const qt = new d("JIS_LC_20");
qt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [12, -3, 12, -3, 0.5, -10] }), qt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5, dashLengthItems: [-33.5, 0.5, -3, 0.5, -3] }), l.set("JIS_LC_20", qt);
const $t = new d("JIS_LC_20A");
$t.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 20, dashLengthItems: [] }), $t.add({ lineAngle: 45, x: 0.4, y: 0, offsetX: 0, offsetY: 20, dashLengthItems: [] }), l.set("JIS_LC_20A", $t);
const Qt = new d("JIS_LC_8");
Qt.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 20, dashLengthItems: [] }), Qt.add({ lineAngle: 45, x: 1, y: 0, offsetX: 0, offsetY: 20, dashLengthItems: [] }), l.set("JIS_LC_8", Qt);
const ts = new d("JIS_LC_8A");
ts.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 7.8, dashLengthItems: [] }), ts.add({ lineAngle: 45, x: 0.4, y: 0, offsetX: 0, offsetY: 7.8, dashLengthItems: [] }), l.set("JIS_LC_8A", ts);
const ss = new d("JIS_RC_10");
ss.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 7.8, dashLengthItems: [] }), ss.add({ lineAngle: 45, x: 1, y: 0, offsetX: 0, offsetY: 7.8, dashLengthItems: [] }), l.set("JIS_RC_10", ss);
const ft = new d("JIS_RC_15");
ft.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 10, dashLengthItems: [] }), ft.add({ lineAngle: 45, x: 0.725, y: 0, offsetX: 0, offsetY: 10, dashLengthItems: [] }), ft.add({ lineAngle: 45, x: 1.45, y: 0, offsetX: 0, offsetY: 10, dashLengthItems: [] }), l.set("JIS_RC_15", ft);
const ut = new d("JIS_RC_18");
ut.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 15, dashLengthItems: [] }), ut.add({ lineAngle: 45, x: 0.725, y: 0, offsetX: 0, offsetY: 15, dashLengthItems: [] }), ut.add({ lineAngle: 45, x: 1.45, y: 0, offsetX: 0, offsetY: 15, dashLengthItems: [] }), l.set("JIS_RC_18", ut);
const ct = new d("JIS_RC_30");
ct.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 18, dashLengthItems: [] }), ct.add({ lineAngle: 45, x: 1, y: 0, offsetX: 0, offsetY: 18, dashLengthItems: [] }), ct.add({ lineAngle: 45, x: 2, y: 0, offsetX: 0, offsetY: 18, dashLengthItems: [] }), l.set("JIS_RC_30", ct);
const gt = new d("JIS_STN_1E");
gt.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 30, dashLengthItems: [] }), gt.add({ lineAngle: 45, x: 1, y: 0, offsetX: 0, offsetY: 30, dashLengthItems: [] }), gt.add({ lineAngle: 45, x: 2, y: 0, offsetX: 0, offsetY: 30, dashLengthItems: [] }), l.set("JIS_STN_1E", gt);
const es = new d("JIS_STN_2_5");
es.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 1, dashLengthItems: [] }), es.add({ lineAngle: 45, x: 0.705, y: 0, offsetX: 0, offsetY: 1, dashLengthItems: [1, -0.5] }), l.set("JIS_STN_2_5", es);
const ns = new d("JIS_WOOD");
ns.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 2.5, dashLengthItems: [] }), ns.add({ lineAngle: 45, x: 1.765, y: 0, offsetX: 0, offsetY: 2.5, dashLengthItems: [1.2, -0.5] }), l.set("JIS_WOOD", ns);
const li = new d("LINE");
li.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 0.70710678, dashLengthItems: [] }), l.set("LINE", li);
const ri = new d("MUDST");
ri.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), l.set("MUDST", ri);
const fi = new d("NET");
fi.add({ lineAngle: 0, x: 0, y: 0, offsetX: 12.7, offsetY: 6.35, dashLengthItems: [6.35, -6.35, 0, -6.35, 0, -6.35] }), l.set("NET", fi);
const is = new d("NET3");
is.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), is.add({ lineAngle: 90, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), l.set("NET3", is);
const pt = new d("PLAST");
pt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), pt.add({ lineAngle: 60, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), pt.add({ lineAngle: 120, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), l.set("PLAST", pt);
const At = new d("PLASTI");
At.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), At.add({ lineAngle: 0, x: 0, y: 0.79375, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), At.add({ lineAngle: 0, x: 0, y: 1.5875, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), l.set("PLASTI", At);
const z = new d("SACNCR");
z.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), z.add({ lineAngle: 0, x: 0, y: 0.79375, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), z.add({ lineAngle: 0, x: 0, y: 1.5875, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), z.add({ lineAngle: 0, x: 0, y: 3.96875, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), l.set("SACNCR", z);
const hs = new d("SQUARE");
hs.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 2.38125, dashLengthItems: [] }), hs.add({ lineAngle: 45, x: 1.6838, y: 0, offsetX: 0, offsetY: 2.38125, dashLengthItems: [0, -2.38125] }), l.set("SQUARE", hs);
const os = new d("STARS");
os.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [3.175, -3.175] }), os.add({ lineAngle: 90, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [3.175, -3.175] }), l.set("STARS", os);
const yt = new d("STEEL");
yt.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 5.4992613154, dashLengthItems: [3.175, -3.175] }), yt.add({ lineAngle: 60, x: 0, y: 0, offsetX: 0, offsetY: 5.4992613154, dashLengthItems: [3.175, -3.175] }), yt.add({ lineAngle: 120, x: 1.5875, y: 2.7496306704, offsetX: 0, offsetY: 5.4992613154, dashLengthItems: [3.175, -3.175] }), l.set("STEEL", yt);
const ds = new d("SWAMP");
ds.add({ lineAngle: 45, x: 0, y: 0, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), ds.add({ lineAngle: 45, x: 0, y: 1.5875, offsetX: 0, offsetY: 3.175, dashLengthItems: [] }), l.set("SWAMP", ds);
const H = new d("TRANS");
H.add({ lineAngle: 0, x: 0, y: 0, offsetX: 12.7, offsetY: 21.9970452362, dashLengthItems: [3.175, -22.225] }), H.add({ lineAngle: 90, x: 1.5875, y: 0, offsetX: 21.9970452362, offsetY: 12.7, dashLengthItems: [1.5875, -42.4065904724] }), H.add({ lineAngle: 90, x: 1.984375, y: 0, offsetX: 21.9970452362, offsetY: 12.7, dashLengthItems: [1.27, -42.7240904724] }), H.add({ lineAngle: 90, x: 1.190625, y: 0, offsetX: 21.9970452362, offsetY: 12.7, dashLengthItems: [1.27, -42.7240904724] }), H.add({ lineAngle: 60, x: 2.38125, y: 0, offsetX: 12.7, offsetY: 21.9970452362, dashLengthItems: [1.016, -24.384] }), H.add({ lineAngle: 120, x: 0.79375, y: 0, offsetX: 12.7, offsetY: 21.9970452362, dashLengthItems: [1.016, -24.384] }), l.set("TRANS", H);
const as = new d("TRIANG");
as.add({ lineAngle: 0, x: 0, y: 0, offsetX: 0, offsetY: 6.35, dashLengthItems: [] }), as.add({ lineAngle: 0, x: 0, y: 3.175, offsetX: 0, offsetY: 6.35, dashLengthItems: [3.175, -3.175] }), l.set("TRIANG", as);
const mt = new d("ZIGZAG");
mt.add({ lineAngle: 60, x: 0, y: 0, offsetX: 4.7625, offsetY: 8.2488919604, dashLengthItems: [4.7625, -4.7625] }), mt.add({ lineAngle: 120, x: 0, y: 0, offsetX: 4.7625, offsetY: 8.2488919604, dashLengthItems: [4.7625, -4.7625] }), mt.add({ lineAngle: 0, x: -2.38125, y: 4.1244459802, offsetX: 4.7625, offsetY: 8.2488919604, dashLengthItems: [4.7625, -4.7625] }), l.set("ZIGZAG", mt);
const Yt = class Yt {
  static fromHex(t) {
    return t.startsWith("#") && (t = t.replace("#", "")), parseInt(t, 16);
  }
  static fromRGB(t, e, n) {
    const i = [t, e, n].reduce(((h, o) => {
      const r = o.toString(16);
      return `${h}${r.length === 1 ? "0" + r : r}`;
    }), "0x00");
    return Yt.fromHex(i);
  }
};
a(Yt, "it");
let Lt = Yt;
const Pe = class Pe {
  constructor(t, e, n) {
    this.type = t, this.subclassMarker = e, this.layerName = n?.layerName, this.handle = F.next(), this.trueColor = n?.trueColor, this.inPaperSpace = !1, this.colorNumber = n?.colorNumber, this.visible = n?.visible, this.lineType = n?.lineType, this.lineTypeScale = n?.lineTypeScale, this.extrusion = n?.extrusion, this.xdatas = [];
  }
  boundingBox() {
    return m.pointBBox(A());
  }
  addXData(t) {
    const e = new ps(t);
    return this.xdatas.push(e), e;
  }
  dxfy(t) {
    var e, n, i;
    t.type(this.type), t.handle(this.handle), t.push(330, this.ownerBlockRecord), t.subclassMarker("AcDbEntity"), this.inPaperSpace && t.push(67, Number(this.inPaperSpace)), t.push(420, this.trueColor), t.layerName(this.layerName || O.layerZeroName), t.lineType(this.lineType), t.colorNumber(this.colorNumber), t.push(48, this.lineTypeScale), t.visibilty(this.visible), t.subclassMarker(this.subclassMarker), this.type !== "HATCH" && (t.push(210, (e = this.extrusion) === null || e === void 0 ? void 0 : e.x), t.push(220, (n = this.extrusion) === null || n === void 0 ? void 0 : n.y), t.push(230, (i = this.extrusion) === null || i === void 0 ? void 0 : i.z)), this.dxfyChild(t), this.xdatas.forEach(((h) => h.dxfy(t)));
  }
};
a(Pe, "ht");
let S = Pe;
var M, As, ui;
(function(s) {
  s[s.Default = 0] = "Default", s[s.Aligned = 1] = "Aligned", s[s.Angular = 2] = "Angular", s[s.Diameter = 3] = "Diameter", s[s.Radius = 4] = "Radius", s[s.Angular3Point = 5] = "Angular3Point", s[s.Ordinate = 6] = "Ordinate", s[s.ReferencedByThis = 32] = "ReferencedByThis", s[s.OrdinateType = 64] = "OrdinateType";
})(M || (M = {})), (function(s) {
  s[s.TopLeft = 1] = "TopLeft", s[s.TopCenter = 2] = "TopCenter", s[s.TopRight = 3] = "TopRight", s[s.MiddleLeft = 4] = "MiddleLeft", s[s.MiddleCenter = 5] = "MiddleCenter", s[s.MiddleRight = 6] = "MiddleRight", s[s.BottomLeft = 7] = "BottomLeft", s[s.BottomCenter = 8] = "BottomCenter", s[s.BottomRight = 9] = "BottomRight";
})(As || (As = {})), (function(s) {
  s[s.AtLeast = 1] = "AtLeast", s[s.Exact = 2] = "Exact";
})(ui || (ui = {}));
const _e = class _e extends S {
  constructor(t) {
    super("DIMENSION", "AcDbDimension", t), this.blockName = t?.blockName, this.definitionPoint = t?.definitionPoint, this.middlePoint = t?.middlePoint, this.dimensionType = M.Default, this.attachmentPoint = t?.attachmentPoint || As.MiddleCenter, this.textLineSpacingStyle = t?.textLineSpacingStyle, this.textLineSpacingFactor = t?.textLineSpacingFactor, this.ActualMeasurement = t?.ActualMeasurement, this.text = t?.text, this.rotation = t?.rotation, this.horizontalDirection = t?.horizontalDirection, this.styleName = t?.styleName;
  }
  dxfyChild(t) {
    t.push(2, this.blockName), t.point3d(this.definitionPoint), t.point3d(this.middlePoint, 1), t.push(70, this.dimensionType), t.push(71, this.attachmentPoint), t.push(72, this.textLineSpacingStyle), t.push(41, this.textLineSpacingFactor), t.push(42, this.ActualMeasurement), t.push(1, this.text), t.push(53, this.rotation === "auto" ? this.rotate() : this.rotation), t.push(51, this.horizontalDirection), t.push(3, this.styleName);
  }
};
a(_e, "lt");
let P = _e;
const Dt = /[<>/\\":;?*|=`]/g;
function K(s) {
  return s * Math.PI / 180;
}
a(K, "ft");
function Fi(s, t) {
  const e = (function(n, i) {
    return Math.sqrt(Math.pow(n.x - i.x, 2) + Math.pow(n.y - i.y, 2));
  })(s, t);
  return e === 0 ? e : 180 * Math.asin(Math.abs(s.y - t.y) / e) / Math.PI;
}
a(Fi, "ut");
const He = class He extends P {
  constructor(t, e, n) {
    super(n), this.dimensionType = M.Aligned, this.insertionPoint = n?.insertionPoint, this.fisrtPoint = t, this.secondPoint = e, this.offset(n?.offset);
  }
  offset(t) {
    if (t == null) return;
    const [e, n] = (function(h, o) {
      const r = h.x - o.x;
      let f = 0;
      return r !== 0 && (f = (h.y - o.y) / r), [f, h.y - f * h.x];
    })(this.fisrtPoint, this.secondPoint), i = (function(h, o) {
      const [r, f] = o;
      return f - h * Math.sqrt(r * r + 1);
    })(t, [e, n]);
    this.definitionPoint = (function(h, o) {
      const [r, f] = h, c = r ?? -1 / r, y = o.y - c * o.x, D = c - r;
      let C = f - y;
      return D !== 0 && (C = (f - y) / D), A(C, r * C + f, o.z);
    })([e, i], this.fisrtPoint);
  }
  rotate() {
    return Fi(this.fisrtPoint, this.secondPoint);
  }
  dxfyChild(t) {
    super.dxfyChild(t), t.subclassMarker("AcDbAlignedDimension"), t.point3d(this.insertionPoint, 2), t.point3d(this.fisrtPoint, 3), t.point3d(this.secondPoint, 4);
  }
};
a(He, "ct");
let ys = He;
const ke = class ke extends P {
  constructor(t, e, n, i) {
    super(i), this.first = t, this.second = e, this.location = n, this.dimensionType = M.Angular;
  }
  rotate() {
    return 0;
  }
  _update() {
    this.definitionPoint = this.second.end;
  }
  dxfyChild(t) {
    this._update(), super.dxfyChild(t), t.subclassMarker("AcDb2LineAngularDimension"), t.point3d(this.first.start, 3), t.point3d(this.first.end, 4), t.point3d(this.second.start, 5), t.point3d(this.location, 6);
  }
};
a(ke, "gt");
let ms = ke;
const We = class We extends P {
  constructor(t, e, n, i) {
    super(i), this.center = t, this.first = e, this.second = n, this.dimensionType = M.Angular3Point;
  }
  rotate() {
    return 0;
  }
  dxfyChild(t) {
    super.dxfyChild(t), t.subclassMarker("AcDb3PointAngularDimension"), t.point3d(this.first, 3), t.point3d(this.second, 4), t.point3d(this.center, 5);
  }
};
a(We, "pt");
let xs = We;
const Ve = class Ve extends P {
  constructor(t, e, n) {
    super(n), this.dimensionType = M.Diameter, this.first = t, this.definitionPoint = e, this.leaderLength = n?.leaderLength;
  }
  rotate() {
    return 0;
  }
  dxfyChild(t) {
    super.dxfyChild(t), t.subclassMarker("AcDbDiametricDimension"), t.point3d(this.first, 5), t.push(40, this.leaderLength);
  }
};
a(Ve, "yt");
let Is = Ve;
const Ue = class Ue extends P {
  constructor(t, e, n) {
    var i;
    super(n), this.dimensionType = M.Default, this.insertionPoint = n?.insertionPoint, this.fisrtPoint = t, this.secondPoint = e, this.angle = (i = n?.angle) !== null && i !== void 0 ? i : 0, this.linearType = n?.linearType, this.offset(n?.offset);
  }
  offset(t) {
    if (t == null) return;
    const e = K(this.angle), n = this.fisrtPoint.x + t * Math.floor(Math.sin(e)), i = this.fisrtPoint.y + t * Math.floor(Math.cos(e));
    this.definitionPoint = A(n, i, 0);
  }
  rotate() {
    return this.angle;
  }
  dxfyChild(t) {
    super.dxfyChild(t), t.subclassMarker("AcDbAlignedDimension"), t.point3d(this.insertionPoint, 2), t.point3d(this.fisrtPoint, 3), t.point3d(this.secondPoint, 4), t.push(50, this.angle), t.push(52, this.linearType), t.subclassMarker("AcDbRotatedDimension");
  }
};
a(Ue, "mt");
let Ss = Ue;
const je = class je extends P {
  constructor(t, e, n) {
    super(n), this.dimensionType = M.Radius, this.first = t, this.definitionPoint = e, this.leaderLength = n?.leaderLength;
  }
  rotate() {
    return 0;
  }
  dxfyChild(t) {
    super.dxfyChild(t), t.subclassMarker("AcDbRadialDimension"), t.point3d(this.first, 5), t.push(40, this.leaderLength);
  }
};
a(je, "xt");
let Ls = je;
const Ge = class Ge extends S {
  get start() {
    return A(this.center.x + this.radius * Math.cos(K(this.startAngle)), this.center.y + this.radius * Math.sin(K(this.startAngle)));
  }
  get end() {
    return A(this.center.x + this.radius * Math.cos(K(this.endAngle)), this.center.y + this.radius * Math.sin(K(this.endAngle)));
  }
  constructor(t, e, n, i, h) {
    super("ARC", "AcDbCircle", h), this.center = t, this.radius = e, this.startAngle = n, this.endAngle = i;
  }
  boundingBox() {
    return m.centerRadiusBBox(this.center, this.radius);
  }
  dxfyChild(t) {
    t.point3d(this.center), t.push(40, this.radius), t.subclassMarker("AcDbArc"), t.push(50, this.startAngle), t.push(51, this.endAngle);
  }
};
a(Ge, "It");
let Ds = Ge;
const ze = class ze extends S {
  constructor(t, e, n, i, h) {
    super("ATTDEF", "AcDbText", h), this.position = t, this.height = e, this.value = i, this.tag = n, this.textStyle = "STANDARD", this.rotation = h?.rotation, this.obliqueAngle = h?.obliqueAngle, this.generationFlags = h?.generationFlags, this.horizontalAlignment = h?.horizontalAlignment, this.verticalAlignment = h?.verticalAlignment, this.secondAlignmentPoint = h?.secondAlignmentPoint, this.relativeXScaleFactor = h?.relativeXScaleFactor;
  }
  boundingBox() {
    return m.pointBBox(this.position);
  }
  dxfyChild(t) {
    t.point3d(this.position), t.push(40, this.height), t.primaryText(this.value), t.push(50, this.rotation), t.push(41, this.relativeXScaleFactor), t.push(51, this.obliqueAngle), t.textStyle(this.textStyle), t.push(71, this.generationFlags), t.push(72, this.horizontalAlignment), this.secondAlignmentPoint && (t.push(11, this.secondAlignmentPoint.x), t.push(21, this.secondAlignmentPoint.y), t.push(31, this.secondAlignmentPoint.z)), t.push(73, this.verticalAlignment), t.subclassMarker("AcDbAttributeDefinition"), t.push(280, 0), t.push(3, ""), t.push(2, this.tag), t.push(70, 0);
  }
};
a(ze, "Lt");
let bs = ze;
const Je = class Je extends S {
  constructor(t, e, n, i, h) {
    super("ATTRIB", "AcDbText", h), this.position = t, this.height = e, this.value = i, this.tag = n, this.textStyle = "STANDARD", this.rotation = h?.rotation, this.obliqueAngle = h?.obliqueAngle, this.generationFlags = h?.generationFlags, this.horizontalAlignment = h?.horizontalAlignment, this.verticalAlignment = h?.verticalAlignment, this.secondAlignmentPoint = h?.secondAlignmentPoint, this.relativeXScaleFactor = h?.relativeXScaleFactor;
  }
  boundingBox() {
    return m.pointBBox(this.position);
  }
  dxfyChild(t) {
    t.point3d(this.position), t.push(40, this.height), t.primaryText(this.value), t.push(50, this.rotation), t.push(41, this.relativeXScaleFactor), t.push(51, this.obliqueAngle), t.textStyle(this.textStyle), t.push(71, this.generationFlags), t.push(72, this.horizontalAlignment), t.point3d(this.secondAlignmentPoint, 1), t.push(73, this.verticalAlignment), t.subclassMarker("AcDbAttribute"), t.push(280, 0), t.push(2, this.tag), t.push(70, 0);
  }
};
a(Je, "St");
let vs = Je;
const Ke = class Ke extends S {
  constructor(t, e, n) {
    super("CIRCLE", "AcDbCircle", n), this.center = t, this.radius = e;
  }
  boundingBox() {
    return m.centerRadiusBBox(this.center, this.radius);
  }
  dxfyChild(t) {
    t.point3d(this.center), t.push(40, this.radius);
  }
};
a(Ke, "Dt");
let Cs = Ke;
const Ze = class Ze extends S {
  constructor(t, e, n, i, h, o) {
    super("ELLIPSE", "AcDbEllipse", o), this.center = t, this.endPointOfMajorAxis = e, this.ratioOfMinorAxisToMajorAxis = n, this.startParameter = i, this.endParameter = h;
  }
  boundingBox() {
    const t = this.center.x, e = this.center.y, n = this.endPointOfMajorAxis.x, i = this.endPointOfMajorAxis.y, h = Math.sqrt(Math.pow(t - (t + n), 2) + Math.pow(e - (e + i), 2));
    return m.centerRadiusBBox(this.center, h);
  }
  dxfyChild(t) {
    t.point3d(this.center), t.point3d(this.endPointOfMajorAxis, 1), t.push(40, this.ratioOfMinorAxisToMajorAxis), t.push(41, this.startParameter), t.push(42, this.endParameter);
  }
};
a(Ze, "bt");
let Xs = Ze;
var X, bt, Fs, ci, Z, Es, Rs, Ys, N, vt, q, Ts, Bs, ws, Ns, Ct, gi, pi, Ai, Xt, Ms, Os, Ps, yi, mi, xi, Ii, Si, Li, Di, _s, Hs, Ft, ks;
(function(s) {
  s[s.None = 0] = "None", s[s.First = 1] = "First", s[s.Second = 2] = "Second", s[s.Third = 4] = "Third", s[s.Fourth = 8] = "Fourth";
})(X || (X = {}));
const qe = class qe extends S {
  constructor(t, e, n, i, h) {
    super("3DFACE", "AcDbFace", h), this.firstCorner = t, this.secondCorner = e, this.thirdCorner = n, this.fourthCorner = i, this.invisibleEdges = h?.invisibleEdges || X.None;
  }
  setFirstEdgeVisible(t) {
    this.setEdgeVisible(X.First, t);
  }
  setSecondEdgeVisible(t) {
    this.setEdgeVisible(X.Second, t);
  }
  setThirdEdgeVisible(t) {
    this.setEdgeVisible(X.Third, t);
  }
  setFourthEdgeVisible(t) {
    this.setEdgeVisible(X.Fourth, t);
  }
  setEdgesVisible(t) {
    this.invisibleEdges = t ? X.None : X.First | X.Second | X.Third | X.Fourth;
  }
  setEdgeVisible(t, e) {
    e ? this.invisibleEdges |= t : this.invisibleEdges === (this.invisibleEdges | t) && (this.invisibleEdges ^= t);
  }
  boundingBox() {
    return m.verticesBBox([this.firstCorner, this.secondCorner, this.thirdCorner, this.fourthCorner]);
  }
  dxfyChild(t) {
    t.point3d(this.firstCorner), t.point3d(this.secondCorner, 1), t.point3d(this.thirdCorner, 2), t.point3d(this.fourthCorner, 3), t.push(70, this.invisibleEdges);
  }
};
a(qe, "hs");
let Ws = qe;
(function(s) {
  s.SOLID = "SOLID", s.ANGLE = "ANGLE", s.ANSI31 = "ANSI31", s.ANSI32 = "ANSI32", s.ANSI33 = "ANSI33", s.ANSI34 = "ANSI34", s.ANSI35 = "ANSI35", s.ANSI36 = "ANSI36", s.ANSI37 = "ANSI37", s.ANSI38 = "ANSI38", s.AR_B816 = "AR_B816", s.AR_B816C = "AR_B816C", s.AR_B88 = "AR_B88", s.AR_BRELM = "AR_BRELM", s.AR_BRSTD = "AR_BRSTD", s.AR_CONC = "AR_CONC", s.AR_HBONE = "AR_HBONE", s.AR_PARQ1 = "AR_PARQ1", s.AR_RROOF = "AR_RROOF", s.AR_RSHKE = "AR_RSHKE", s.AR_SAND = "AR_SAND", s.BOX = "BOX", s.BRASS = "BRASS", s.BRICK = "BRICK", s.BRSTONE = "BRSTONE", s.CLAY = "CLAY", s.CORK = "CORK", s.CROSS = "CROSS", s.DASH = "DASH", s.DOLMIT = "DOLMIT", s.DOTS = "DOTS", s.EARTH = "EARTH", s.ESCHER = "ESCHER", s.FLEX = "FLEX", s.GOST_GLASS = "GOST_GLASS", s.GOST_WOOD = "GOST_WOOD", s.GOST_GROUND = "GOST_GROUND", s.GRASS = "GRASS", s.GRATE = "GRATE", s.GRAVEL = "GRAVEL", s.HEX = "HEX", s.HONEY = "HONEY", s.HOUND = "HOUND", s.INSUL = "INSUL", s.ACAD_ISO02W100 = "ACAD_ISO02W100", s.ACAD_ISO03W100 = "ACAD_ISO03W100", s.ACAD_ISO04W100 = "ACAD_ISO04W100", s.ACAD_ISO05W100 = "ACAD_ISO05W100", s.ACAD_ISO06W100 = "ACAD_ISO06W100", s.ACAD_ISO07W100 = "ACAD_ISO07W100", s.ACAD_ISO08W100 = "ACAD_ISO08W100", s.ACAD_ISO09W100 = "ACAD_ISO09W100", s.ACAD_ISO10W100 = "ACAD_ISO10W100", s.ACAD_ISO11W100 = "ACAD_ISO11W100", s.ACAD_ISO12W100 = "ACAD_ISO12W100", s.ACAD_ISO13W100 = "ACAD_ISO13W100", s.ACAD_ISO14W100 = "ACAD_ISO14W100", s.ACAD_ISO15W100 = "ACAD_ISO15W100", s.JIS_LC_20 = "JIS_LC_20", s.JIS_LC_20A = "JIS_LC_20A", s.JIS_LC_8 = "JIS_LC_8", s.JIS_LC_8A = "JIS_LC_8A", s.JIS_RC_10 = "JIS_RC_10", s.JIS_RC_15 = "JIS_RC_15", s.JIS_RC_18 = "JIS_RC_18", s.JIS_RC_30 = "JIS_RC_30", s.JIS_STN_1E = "JIS_STN_1E", s.JIS_STN_2_5 = "JIS_STN_2_5", s.JIS_WOOD = "JIS_WOOD", s.LINE = "LINE", s.MUDST = "MUDST", s.NET = "NET", s.NET3 = "NET3", s.PLAST = "PLAST", s.PLASTI = "PLASTI", s.SACNCR = "SACNCR", s.SQUARE = "SQUARE", s.STARS = "STARS", s.STEEL = "STEEL", s.SWAMP = "SWAMP", s.TRANS = "TRANS", s.TRIANG = "TRIANG", s.ZIGZAG = "ZIGZAG";
})(bt || (bt = {})), (function(s) {
  s[s.UserDefined = 0] = "UserDefined", s[s.Predifined = 1] = "Predifined", s[s.Custom = 2] = "Custom";
})(Fs || (Fs = {}));
(function(s) {
  s[s.Default = 0] = "Default", s[s.External = 1] = "External", s[s.Polyline = 2] = "Polyline", s[s.Derived = 4] = "Derived", s[s.Textbox = 8] = "Textbox", s[s.Outermost = 16] = "Outermost";
})(ci || (ci = {}));
(function(s) {
  s[s.SolidFill = 1] = "SolidFill", s[s.PatternFill = 0] = "PatternFill";
})(Z || (Z = {})), (function(s) {
  s[s.NonAssociative = 0] = "NonAssociative", s[s.Associative = 1] = "Associative";
})(Es || (Es = {})), (function(s) {
  s[s.Normal = 0] = "Normal", s[s.Outer = 1] = "Outer", s[s.Ignore = 2] = "Ignore";
})(Rs || (Rs = {})), (function(s) {
  s.LINEAR = "LINEAR", s.CYLINDER = "CYLINDER", s.INVCYLINDER = "INVCYLINDER", s.SPHERICAL = "SPHERICAL", s.HEMISPHERICAL = "HEMISPHERICAL", s.CURVED = "CURVED", s.INVSPHERICAL = "SPHERICAL", s.INVHEMISPHERICAL = "INVHEMISPHERICAL", s.INVCURVED = "INVCURVED";
})(Ys || (Ys = {}));
const $e = class $e extends S {
  get patternName() {
    let t = bt.SOLID;
    return this.isPattern(this.fill) && (t = this.fill.name), t;
  }
  get solidFillFlag() {
    return this.patternName === bt.SOLID ? Z.SolidFill : Z.PatternFill;
  }
  constructor(t, e, n) {
    super("HATCH", "AcDbHatch", n), this.fill = e, this.elevation = n?.elevation || 0, this.extrusion = n?.extrusion || A(0, 0, 1), this.boundaryPath = t;
  }
  pattern(t, e) {
    var n;
    const i = e.name, h = (n = e.angle) !== null && n !== void 0 ? n : 0, o = e.scale || 1, r = e.double || !1;
    t.push(52, h), t.push(41, o), t.push(77, Number(r));
    const f = l.get(i);
    f && (f.scale = o, h !== 0 && (f.angle = h), f.dxfy(t));
  }
  gradient(t, e) {
    var n, i, h;
    const o = e.firstColor, r = (n = e.secondColor) !== null && n !== void 0 ? n : 7, f = (i = e.angle) !== null && i !== void 0 ? i : 0, c = e.definition || 0, y = (h = e.tint) !== null && h !== void 0 ? h : 1, D = e.type || Ys.LINEAR;
    t.push(450, 1), t.push(451, 0), t.push(460, f), t.push(461, c), t.push(452, e.secondColor ? 0 : 1), t.push(462, y), t.push(453, 2), t.push(463, 0), t.push(63, o), t.push(421, Lt.fromHex(Gn(o))), t.push(463, 1), t.push(63, r), t.push(421, Lt.fromHex(Gn(r))), t.push(470, D);
  }
  isPattern(t) {
    return "name" in t;
  }
  boundingBox() {
    return m.pointBBox(A(0, 0));
  }
  dxfyChild(t) {
    var e, n, i;
    t.point3d(A(0, 0, this.elevation)), t.push(210, (e = this.extrusion) === null || e === void 0 ? void 0 : e.x), t.push(220, (n = this.extrusion) === null || n === void 0 ? void 0 : n.y), t.push(230, (i = this.extrusion) === null || i === void 0 ? void 0 : i.z), t.name(this.patternName), t.push(70, this.solidFillFlag), t.push(71, Es.NonAssociative), t.push(91, this.boundaryPath.length), this.boundaryPath.dxfy(t), t.push(75, Rs.Outer), t.push(76, Fs.Predifined), this.isPattern(this.fill) ? (this.solidFillFlag === Z.PatternFill && this.pattern(t, this.fill), t.push(47, 1), t.push(98, 0)) : (t.push(47, 1), t.push(98, 0), this.gradient(t, this.fill));
  }
};
a($e, "gs");
let Vs = $e;
(function(s) {
  s[s.ShowImage = 1] = "ShowImage", s[s.ShowImageWhenNotAlignedWithScreen = 2] = "ShowImageWhenNotAlignedWithScreen", s[s.UseClippingBoundary = 4] = "UseClippingBoundary", s[s.TransparencyIsOn = 8] = "TransparencyIsOn";
})(vt || (vt = {})), (function(s) {
  s[s.Rectangular = 1] = "Rectangular", s[s.Polygonal = 2] = "Polygonal";
})(q || (q = {})), (function(s) {
  s[s.Off = 0] = "Off", s[s.On = 1] = "On";
})(Ts || (Ts = {})), (function(s) {
  s[s.Outside = 0] = "Outside", s[s.Inside = 1] = "Inside";
})(Bs || (Bs = {}));
const Qe = class Qe extends S {
  constructor(t, e) {
    super("IMAGE", "AcDbRasterImage", e), N.set(this, void 0), this.width = t.width, this.height = t.height, this.scale = t.scale, this.rotation = t.rotation, this.insertionPoint = t.insertionPoint, this.ratio = this.scale / this.width, this.imageDefHandle = t.imageDefHandle, this.imageDisplayFlags = e?.imageDisplayFlags || vt.ShowImage | vt.ShowImageWhenNotAlignedWithScreen, this.clippingStateFlag = e?.clippingStateFlag || Ts.On, this.clipModeFlag = e?.clipModeFlag || Bs.Inside, this.clippingType = e?.clippingType || q.Rectangular, this.brightness = e?.brightness || 50, this.contrast = e?.brightness || 50, this.fade = e?.fade || 0, J(this, N, []), this.classVersion = e?.classVersion || 0, this.resetClipping();
  }
  setClipBoundaryVerticies(t, e) {
    if (e === q.Rectangular) {
      if (t.length != 2) throw new Error("The number of vertices should be 2 in rectangular clipping !");
      J(this, N, t);
    } else {
      if (!(t.length >= 3)) throw new Error("The number of vertices should be >= 3 in polygonal clipping !");
      J(this, N, t);
    }
    J(this, N, []), p(this, N, "f").push(...t);
  }
  resetClipping() {
    const t = [x(-0.5, -0.5), x(this.width - 0.5, this.height - 0.5)];
    this.setClipBoundaryVerticies(t, q.Rectangular);
  }
  _vector() {
    return x(this.ratio * Math.cos(this.rotation * Math.PI / 180), this.ratio * Math.sin(this.rotation * Math.PI / 180));
  }
  _uVector() {
    const t = this._vector();
    return A(t.x, -t.y, 0);
  }
  _vVector() {
    const t = this._vector();
    return A(t.y, t.x, 0);
  }
  boundingBox() {
    const t = this.scale, e = this.width / this.height * this.scale, n = Math.sqrt(Math.pow(t, 2) + Math.pow(e, 2));
    return m.centerRadiusBBox(this.insertionPoint, n);
  }
  dxfyChild(t) {
    t.push(90, this.classVersion), t.point3d(this.insertionPoint), t.point3d(this._uVector(), 1), t.point3d(this._vVector(), 2), t.push(13, this.width), t.push(23, this.height), t.push(340, this.imageDefHandle), t.push(70, this.imageDisplayFlags), t.push(280, this.clippingStateFlag), t.push(281, this.brightness), t.push(282, this.contrast), t.push(283, this.fade), t.push(360, this.imageDefReactorHandle), t.push(71, this.clippingType), t.push(91, p(this, N, "f").length), p(this, N, "f").forEach(((e) => t.point2d(e, 4))), t.push(290, this.clipModeFlag);
  }
};
a(Qe, "ps");
let Us = Qe;
N = /* @__PURE__ */ new WeakMap();
const tn = class tn extends S {
  constructor(t, e, n) {
    var i, h, o, r, f, c;
    super("INSERT", "AcDbBlockReference", n), this.blockName = t, this.insertionPoint = e, this.scaleFactor = n?.scaleFactor || A(1, 1, 1), this.rotationAngle = (i = n?.rotationAngle) !== null && i !== void 0 ? i : 0, this.columnCount = (h = n?.columnCount) !== null && h !== void 0 ? h : 1, this.rowCount = (o = n?.rowCount) !== null && o !== void 0 ? o : 1, this.columnSpacing = (r = n?.columnSpacing) !== null && r !== void 0 ? r : 0, this.rowSpacing = (f = n?.rowSpacing) !== null && f !== void 0 ? f : 0, this.attributesFollowFlag = (c = n?.rowSpacing) !== null && c !== void 0 ? c : 0;
  }
  boundingBox() {
    return m.pointBBox(this.insertionPoint);
  }
  dxfyChild(t) {
    t.name(this.blockName), t.point3d(this.insertionPoint), t.push(41, this.scaleFactor.x), t.push(42, this.scaleFactor.y), t.push(43, this.scaleFactor.z), t.push(50, this.rotationAngle), t.push(66, this.attributesFollowFlag), t.push(70, this.columnCount), t.push(71, this.rowCount), t.push(44, this.columnSpacing), t.push(45, this.rowSpacing);
  }
};
a(tn, "As");
let js = tn;
(function(s) {
  s[s.Disabed = 0] = "Disabed", s[s.Enabled = 1] = "Enabled";
})(ws || (ws = {})), (function(s) {
  s[s.StraightLine = 0] = "StraightLine", s[s.Spline = 1] = "Spline";
})(Ns || (Ns = {}));
const sn = class sn extends S {
  constructor(t, e) {
    var n, i;
    super("LEADER", "AcDbLeader", e), this.vertices = t, this.flag = (n = e?.flag) !== null && n !== void 0 ? n : ws.Enabled, this.leaderPathType = (i = e?.leaderPathType) !== null && i !== void 0 ? i : Ns.StraightLine, this.dimensionStyleName = e?.dimensionStyleName || "Standard";
  }
  boundingBox() {
    return m.verticesBBox(this.vertices);
  }
  dxfyChild(t) {
    t.push(3, this.dimensionStyleName), t.push(71, this.flag), t.push(72, this.leaderPathType), t.push(76, this.vertices.length), this.vertices.forEach(((e) => t.point3d(e)));
  }
};
a(sn, "ys");
let Gs = sn;
const en = class en extends S {
  constructor(t, e, n) {
    super("LINE", "AcDbLine", n), this.startPoint = t, this.endPoint = e;
  }
  boundingBox() {
    return m.lineBBox(this.startPoint, this.endPoint);
  }
  dxfyChild(t) {
    t.point3d(this.startPoint), t.point3d(this.endPoint, 1);
  }
};
a(en, "ms");
let zs = en;
(function(s) {
  s[s.None = 0] = "None", s[s.Closed = 1] = "Closed", s[s.Plinegen = 128] = "Plinegen";
})(Ct || (Ct = {}));
const nn = class nn extends S {
  constructor(t, e) {
    super("LWPOLYLINE", "AcDbPolyline", e), this.vertices = t, this.flags = e?.flags || Ct.None, this.constantWidth = e?.constantWidth || 0, this.elevation = e?.elevation || 0, this.thickness = e?.thickness || 0;
  }
  boundingBox() {
    return m.verticesBBox(this.vertices.map(((t) => A(t.point.x, t.point.y, 0))));
  }
  dxfyChild(t) {
    var e, n, i;
    t.push(90, this.vertices.length), t.push(70, this.flags || 0), this.vertices.find(((h) => {
      var o, r;
      return ((o = h.startingWidth) !== null && o !== void 0 ? o : 0) > 0 && ((r = h.endWidth) !== null && r !== void 0 ? r : 0) > 0;
    })) || t.push(43, this.constantWidth), t.elevation(this.elevation), t.thickness(this.thickness);
    for (const h of this.vertices) t.point2d(h.point), t.push(40, h.startingWidth), t.push(41, h.endWidth), t.push(42, h.bulge);
    t.push(210, (e = this.extrusion) === null || e === void 0 ? void 0 : e.x), t.push(220, (n = this.extrusion) === null || n === void 0 ? void 0 : n.y), t.push(230, (i = this.extrusion) === null || i === void 0 ? void 0 : i.z);
  }
};
a(nn, "xs");
let Js = nn;
(function(s) {
  s[s.TopLeft = 1] = "TopLeft", s[s.TopCenter = 2] = "TopCenter", s[s.TopRight = 3] = "TopRight", s[s.MiddleLeft = 4] = "MiddleLeft", s[s.MiddleCenter = 5] = "MiddleCenter", s[s.MiddleRight = 6] = "MiddleRight", s[s.BottomLeft = 7] = "BottomLeft", s[s.BottomCenter = 8] = "BottomCenter", s[s.BottomRight = 9] = "BottomRight";
})(gi || (gi = {})), (function(s) {
  s[s.LeftToRight = 1] = "LeftToRight", s[s.TopToBottom = 3] = "TopToBottom", s[s.ByStyle = 5] = "ByStyle";
})(pi || (pi = {})), (function(s) {
  s[s.AtLeast = 1] = "AtLeast", s[s.Exact = 2] = "Exact";
})(Ai || (Ai = {}));
const hn = class hn extends S {
  constructor(t, e, n, i) {
    super("MTEXT", "AcDbMText", i), this.position = t, this.height = e, this.value = n, this.textStyle = "STANDARD", this.rotation = i?.rotation, this.attachmentPoint = i?.attachmentPoint, this.drawingDirection = i?.drawingDirection, this.lineSpacingStyle = i?.lineSpacingStyle, this.width = i?.width;
  }
  boundingBox() {
    return m.pointBBox(this.position);
  }
  dxfyChild(t) {
    t.point3d(this.position), t.push(40, this.height), t.push(41, this.width), t.push(71, this.attachmentPoint), t.push(72, this.drawingDirection), t.push(73, this.lineSpacingStyle), t.primaryText(this.value), t.push(50, this.rotation), t.textStyle(this.textStyle);
  }
};
a(hn, "Is");
let Ks = hn;
const on = class on extends S {
  constructor(t, e, n, i) {
    super("POINT", "AcDbPoint", i), this.x = t, this.y = e, this.z = n;
  }
  boundingBox() {
    return m.pointBBox(A(this.x, this.y, this.z));
  }
  dxfyChild(t) {
    t.point3d(A(this.x, this.y, this.z));
  }
};
a(on, "Ls");
let Zs = on;
(function(s) {
  s[s.None = 0] = "None", s[s.ExtraVertex = 1] = "ExtraVertex", s[s.CurveFit = 2] = "CurveFit", s[s.NotUsed = 4] = "NotUsed", s[s.SplineVertex = 8] = "SplineVertex", s[s.SplineFrame = 16] = "SplineFrame", s[s.Polyline3dVertex = 32] = "Polyline3dVertex", s[s.Polygon3dMesh = 64] = "Polygon3dMesh", s[s.PolyfaceMeshVertex = 128] = "PolyfaceMeshVertex";
})(Xt || (Xt = {}));
const dn = class dn extends S {
  constructor(t, e) {
    var n;
    super("VERTEX", "AcDbVertex", e), this.point = t, this.flags = (n = e?.flags) !== null && n !== void 0 ? n : Xt.None, e && ("startingWidth" in e && (this.startingWidth = e.startingWidth), "endWidth" in e && (this.endWidth = e.endWidth), "bulge" in e && (this.bulge = e.bulge));
  }
  boundingBox() {
    return m.pointBBox(this.point);
  }
  dxfyChild(t) {
    t.subclassMarker("AcDb3dPolylineVertex"), t.point3d(this.point), t.push(40, this.startingWidth), t.push(41, this.endWidth), t.push(42, this.bulge), t.push(70, this.flags);
  }
};
a(dn, "Ss");
let qs = dn;
const an = class an extends S {
  dxfyChild(t) {
  }
  constructor() {
    super("SEQEND");
  }
};
a(an, "Ds");
let Et = an;
(function(s) {
  s[s.None = 0] = "None", s[s.Closed = 1] = "Closed", s[s.CurveFit = 2] = "CurveFit", s[s.SplineFit = 4] = "SplineFit", s[s.Polyline3D = 8] = "Polyline3D", s[s.PolygonMesh3D = 16] = "PolygonMesh3D", s[s.PolygonMeshClosed = 32] = "PolygonMeshClosed", s[s.PolyfaceMesh = 64] = "PolyfaceMesh", s[s.LinetypeGenerated = 128] = "LinetypeGenerated";
})(Ms || (Ms = {})), (function(s) {
  s[s.NoSmooth = 0] = "NoSmooth", s[s.QuadraticBSpline = 5] = "QuadraticBSpline", s[s.CubicBSpline = 6] = "CubicBSpline", s[s.Bezier = 8] = "Bezier";
})(Os || (Os = {}));
const ln = class ln extends S {
  constructor(t, e) {
    var n, i, h, o, r, f, c, y, D, C;
    super("POLYLINE", "AcDb3dPolyline", e), this._seqend = new Et(), this.vertices = [], this.thickness = (n = e?.thickness) !== null && n !== void 0 ? n : 0, this.elevation = (i = e?.elevation) !== null && i !== void 0 ? i : 0, this.flags = (h = e?.flags) !== null && h !== void 0 ? h : Ms.None, this.defaultStartWidth = (o = e?.defaultStartWidth) !== null && o !== void 0 ? o : 0, this.defaultEndWidth = (r = e?.defaultEndWidth) !== null && r !== void 0 ? r : 0, this.polygonMeshM = (f = e?.polygonMeshM) !== null && f !== void 0 ? f : 0, this.polygonMeshN = (c = e?.polygonMeshN) !== null && c !== void 0 ? c : 0, this.smoothSurfaceM = (y = e?.smoothSurfaceM) !== null && y !== void 0 ? y : 0, this.smoothSurfaceN = (D = e?.smoothSurfaceN) !== null && D !== void 0 ? D : 0, this.surfaceType = (C = e?.surfaceType) !== null && C !== void 0 ? C : Os.NoSmooth, t.forEach(((tt) => this.vertices.push(new qs(tt.point, { startingWidth: tt.startingWidth, endWidth: tt.endWidth, bulge: tt.bulge, flags: Xt.Polyline3dVertex }))));
  }
  boundingBox() {
    return m.verticesBBox(this.vertices.map(((t) => t.point)));
  }
  dxfyChild(t) {
    t.push(66, 1), t.point3d(A(0, 0, this.elevation)), t.push(39, this.thickness), t.push(70, this.flags), t.push(40, this.defaultStartWidth), t.push(41, this.defaultEndWidth), t.push(71, this.polygonMeshM), t.push(72, this.polygonMeshN), t.push(73, this.smoothSurfaceM), t.push(74, this.smoothSurfaceN), t.push(75, this.surfaceType), this.vertices.forEach(((e) => e.dxfy(t))), this._seqend.dxfy(t);
  }
};
a(ln, "bs");
let $s = ln;
(function(s) {
  s[s.Closed = 1] = "Closed", s[s.Periodic = 2] = "Periodic", s[s.Rational = 4] = "Rational", s[s.Planar = 8] = "Planar", s[s.Linear = 16] = "Linear";
})(Ps || (Ps = {}));
const rn = class rn extends S {
  constructor(t, e) {
    var n, i;
    super("SPLINE", "AcDbSpline", e), this.controlPoints = t.controlPoints, this.degreeCurve = (n = t.degreeCurve) !== null && n !== void 0 ? n : 3, this.flags = (i = t.flags) !== null && i !== void 0 ? i : Ps.Planar, this.knots = t.knots || [], this.weights = t.weights || [], this.fitPoints = t.fitPoints || [];
    const h = this.controlPoints.length, o = this.degreeCurve, r = o + 1, f = this.fitPoints.length;
    if (h < r) throw new Error(`Number of control points should be >= ${r}.`);
    if (f !== 0 && f < 2) throw new Error("Number of fit points should be >= 2.");
    const c = o + h + 1;
    if (this.knots.length === 0) {
      let y = 0;
      for (let D = 0; D < c; D++) D <= o || D >= h + 1 ? this.knots.push(y) : this.knots.push(++y);
    }
    if (this.knots.length !== c) throw new Error(`Number of knots should be ${c}.`);
  }
  boundingBox() {
    return m.verticesBBox([...this.controlPoints, ...this.fitPoints]);
  }
  dxfyChild(t) {
    t.push(70, this.flags), t.push(71, this.degreeCurve), t.push(72, this.knots.length), t.push(73, this.controlPoints.length), t.push(74, this.fitPoints.length), t.push(42, "0.0000001"), t.push(43, "0.0000001"), t.push(42, "0.0000000001"), this.knots.forEach(((e) => t.push(40, e))), this.weights.forEach(((e) => t.push(41, e))), this.controlPoints.forEach(((e) => t.point3d(e))), this.fitPoints.forEach(((e) => t.point3d(e, 1)));
  }
};
a(rn, "vs");
let Qs = rn;
(function(s) {
  s[s.Text = 1] = "Text", s[s.Block = 2] = "Block";
})(yi || (yi = {})), (function(s) {
  s[s.False = 0] = "False", s[s.True = 1] = "True";
})(mi || (mi = {})), (function(s) {
  s[s.False = 0] = "False", s[s.True = 1] = "True";
})(xi || (xi = {})), (function(s) {
  s[s.TopLeft = 1] = "TopLeft", s[s.TopCenter = 2] = "TopCenter", s[s.TopRight = 3] = "TopRight", s[s.MiddleLeft = 4] = "MiddleLeft", s[s.MiddleCenter = 5] = "MiddleCenter", s[s.MiddleRight = 6] = "MiddleRight", s[s.BottomLeft = 7] = "BottomLeft", s[s.BottomCenter = 8] = "BottomCenter", s[s.BottomRight = 9] = "BottomRight";
})(Ii || (Ii = {}));
const fn = class fn extends S {
  constructor(t, e, n, i, h, o, r) {
    super("ACAD_TABLE", "AcDbBlockReference", r), this.blockName = t, this.position = e, this.numberOfRows = n, this.numberOfColumn = i, this.rowsHeight = h, this.columnsHeight = o, this.horizontalDirectionVector = r?.horizontalDirectionVector || A(1), this.cells = r?.cell;
  }
  boundingBox() {
    return m.pointBBox(this.position);
  }
  dxfyChild(t) {
    var e, n, i, h;
    t.name(this.blockName), t.point3d(this.position), t.subclassMarker("AcDbTable"), t.point3d(this.horizontalDirectionVector, 1), t.push(91, this.numberOfRows), t.push(92, this.numberOfColumn);
    for (let o = 0; o < this.numberOfRows; o++) t.push(141, (n = (e = this.rowsHeight[o]) !== null && e !== void 0 ? e : this.rowsHeight[0]) !== null && n !== void 0 ? n : 1);
    for (let o = 0; o < this.numberOfColumn; o++) t.push(142, (h = (i = this.columnsHeight[o]) !== null && i !== void 0 ? i : this.columnsHeight[0]) !== null && h !== void 0 ? h : 1);
    this.cells.forEach(((o) => o.dxfy(t)));
  }
};
a(fn, "Fs");
let te = fn;
(function(s) {
  s[s.None = 0] = "None", s[s.Backward = 2] = "Backward", s[s.UpsideDown = 4] = "UpsideDown";
})(Si || (Si = {})), (function(s) {
  s[s.Left = 0] = "Left", s[s.Center = 1] = "Center", s[s.Right = 2] = "Right", s[s.Aligned = 3] = "Aligned", s[s.Middle = 4] = "Middle", s[s.Fit = 5] = "Fit";
})(Li || (Li = {})), (function(s) {
  s[s.BaseLine = 0] = "BaseLine", s[s.Bottom = 1] = "Bottom", s[s.Middle = 2] = "Middle", s[s.Top = 3] = "Top";
})(Di || (Di = {}));
const un = class un extends S {
  constructor(t, e, n, i) {
    super("TEXT", "AcDbText", i), this.position = t, this.height = e, this.value = n, this.textStyle = "STANDARD", this.rotation = i?.rotation, this.obliqueAngle = i?.obliqueAngle, this.generationFlags = i?.generationFlags, this.horizontalAlignment = i?.horizontalAlignment, this.verticalAlignment = i?.verticalAlignment, this.secondAlignmentPoint = i?.secondAlignmentPoint, this.relativeXScaleFactor = i?.relativeXScaleFactor;
  }
  boundingBox() {
    return m.pointBBox(this.position);
  }
  dxfyChild(t) {
    t.point3d(this.position), t.push(40, this.height), t.primaryText(this.value), t.push(50, this.rotation), t.push(41, this.relativeXScaleFactor), t.push(51, this.obliqueAngle), t.textStyle(this.textStyle), t.push(71, this.generationFlags), t.push(72, this.horizontalAlignment), t.point3d(this.secondAlignmentPoint, 1), t.subclassMarker("AcDbText"), t.push(73, this.verticalAlignment);
  }
};
a(un, "Cs");
let se = un;
const cn = class cn {
  constructor(t, e, n) {
    this.entities = [], this.handle = F.next(), this.objects = t, this.blockRecord = e, this.layerName = n;
  }
  dxfy(t) {
    for (const e of this.entities) e.dxfy(t);
  }
  addHatch(t, e, n) {
    const i = new Vs(t, e, n);
    return this.addEntity(i);
  }
  addEntity(t) {
    return t.ownerBlockRecord = this.blockRecord.handle, this.blockRecord.isPaperSpace && (t.inPaperSpace = !0), t.layerName == null && (t.layerName = this.layerName), this.entities.push(t), t;
  }
  addAttrib(t, e, n, i, h, o) {
    h.attributesFollowFlag = 1;
    const r = this.addEntity(new vs(t, e, n, i, o));
    return this.addEntity(new Et()).ownerBlockRecord = h.handle, r;
  }
  addAttdef(t, e, n, i, h) {
    return this.addEntity(new bs(t, e, n, i, h));
  }
  addAlignedDim(t, e, n) {
    return this.addEntity(new ys(t, e, n));
  }
  addDiameterDim(t, e, n) {
    return this.addEntity(new Is(t, e, n));
  }
  addRadialDim(t, e, n) {
    return this.addEntity(new Ls(t, e, n));
  }
  addLinearDim(t, e, n) {
    return this.addEntity(new Ss(t, e, n));
  }
  addAngularLinesDim(t, e, n, i) {
    return this.addEntity(new ms(t, e, n, i));
  }
  addAngularPointsDim(t, e, n, i) {
    return this.addEntity(new xs(t, e, n, i));
  }
  addLine(t, e, n) {
    return this.addEntity(new zs(t, e, n));
  }
  addLeader(t, e) {
    return this.addEntity(new Gs(t, e));
  }
  addLWPolyline(t, e) {
    return this.addEntity(new Js(t, e));
  }
  addRectangle(t, e, n) {
    const i = [], h = t.x, o = t.y, r = e.x, f = e.y;
    if (n?.fillet !== void 0 && n?.chamfer !== void 0) throw new Error("You cannot define both fillet and chamfer!");
    if (n?.fillet !== void 0) {
      const c = n?.fillet, y = Ci(c);
      i.push({ point: x(h, o - c), bulge: y }), i.push({ point: x(h + c, o) }), i.push({ point: x(r - c, o), bulge: y }), i.push({ point: x(r, o - c) }), i.push({ point: x(r, f + c), bulge: y }), i.push({ point: x(r - c, f) }), i.push({ point: x(h + c, f), bulge: y }), i.push({ point: x(h, f + c) });
    } else if (n?.chamfer !== void 0) {
      const c = n?.chamfer.first, y = n?.chamfer.second || c;
      i.push({ point: x(h, o - c) }), i.push({ point: x(h + y, o) }), i.push({ point: x(r - c, o) }), i.push({ point: x(r, o - y) }), i.push({ point: x(r, f + c) }), i.push({ point: x(r - y, f) }), i.push({ point: x(h + c, f) }), i.push({ point: x(h, f + y) });
    } else i.push({ point: x(h, o) }), i.push({ point: x(r, o) }), i.push({ point: x(r, f) }), i.push({ point: x(h, f) });
    return this.addLWPolyline(i, Object.assign(Object.assign({}, n), { flags: Ct.Closed }));
  }
  addImage(t, e, n, i, h, o, r, f) {
    const c = this.objects.addImageDef(t);
    c.width = i, c.height = h;
    const y = new Us({ height: h, width: i, scale: o, rotation: r, insertionPoint: n, imageDefHandle: c.handle }, f), D = this.objects.addImageDefReactor(y.handle);
    y.imageDefReactorHandle = D.handle, this.addEntity(y);
    const C = this.objects.addDictionary();
    return C.addEntryObject(e, c.handle), c.ownerObjecthandle = C.handle, this.objects.root.addEntryObject("ACAD_IMAGE_DICT", C.handle), c.acadImageDictHandle = C.handle, c.addImageDefReactorHandle(D.handle), y;
  }
  addPolyline3D(t, e) {
    return this.addEntity(new $s(t, e));
  }
  addPoint(t, e, n, i) {
    return this.addEntity(new Zs(t, e, n, i));
  }
  addCircle(t, e, n) {
    return this.addEntity(new Cs(t, e, n));
  }
  addArc(t, e, n, i, h) {
    return this.addEntity(new Ds(t, e, n, i, h));
  }
  addSpline(t, e) {
    return this.addEntity(new Qs(t, e));
  }
  addEllipse(t, e, n, i, h, o) {
    const r = new Xs(t, e, n, i, h, o);
    return this.addEntity(r), r;
  }
  add3dFace(t, e, n, i, h) {
    return this.addEntity(new Ws(t, e, n, i, h));
  }
  addText(t, e, n, i) {
    return this.addEntity(new se(t, e, n, i));
  }
  addMText(t, e, n, i) {
    return this.addEntity(new Ks(t, e, n, i));
  }
  addInsert(t, e, n) {
    return this.addEntity(new js(t, e, n || {}));
  }
  addTable(t, e, n, i, h, o, r) {
    return this.addEntity(new te(t, e, n, i, h, o, r));
  }
  boundingBox() {
    const t = [];
    for (let e = 0; e < this.entities.length; e++) t.push(this.entities[e].boundingBox());
    return m.boundingBox(t);
  }
  centerView() {
    return m.boundingBoxCenter(this.boundingBox());
  }
  viewHeight() {
    return m.boundingBoxHeight(this.boundingBox());
  }
};
a(cn, "Ts");
let ee = cn;
(function(s) {
  s[s.None = 0] = "None", s[s.AnonymousBlock = 1] = "AnonymousBlock", s[s.HasNonConstantAttribute = 2] = "HasNonConstantAttribute", s[s.XRef = 4] = "XRef", s[s.XRefOverlay = 8] = "XRefOverlay", s[s.ExternallyDependent = 16] = "ExternallyDependent", s[s.ResolvedXRef = 32] = "ResolvedXRef", s[s.ReferencedXRef = 64] = "ReferencedXRef";
})(_s || (_s = {}));
const gn = class gn extends ee {
  get isPaperSpace() {
    return this.name.startsWith("*Paper_Space");
  }
  get isModelSpace() {
    return this.name.startsWith("*Model_Space");
  }
  get isModelOrPaperSpace() {
    return this.isModelSpace || this.isPaperSpace;
  }
  constructor(t, e, n) {
    super(n, e, "0"), this.name = t, this.flags = _s.None, this.endBlk = new ls(), this.ownerObjectHandle = e.handle, this.basePoint = A(0, 0, 0), this.xrefPathName = "";
  }
  setLayerName(t) {
    this.layerName = t;
  }
  dxfy(t) {
    t.type("BLOCK"), t.handle(this.handle), t.push(330, this.ownerObjectHandle), t.subclassMarker("AcDbEntity"), t.layerName(this.layerName), t.subclassMarker("AcDbBlockBegin"), t.name(this.name), t.push(70, this.flags), t.point3d(this.basePoint), t.name(this.name, 3), t.push(1, this.xrefPathName), this.isModelSpace || this.name === "*Paper_Space" || super.dxfy(t), this.endBlk.dxfy(t);
  }
};
a(gn, "Xs");
let ne = gn;
const pn = class pn {
  constructor(t, e) {
    this.blocks = [], this.paperSpaceSeed = 0, this.tables = t, this.objects = e, this.modelSpace = this.addBlock("*Model_Space", e, !1), this.paperSpace = this.addBlock("*Paper_Space", e, !1);
  }
  addBlock(t, e, n = !0) {
    n && (t = t.replace(Dt, ""));
    const i = this.tables.addBlockRecord(t), h = new ne(t, i, e);
    return this.blocks.push(h), h;
  }
  addPaperSpace() {
    const t = "*Paper_Space" + this.paperSpaceSeed++;
    return this.addBlock(t, this.objects, !1);
  }
  dxfy(t) {
    t.start("BLOCKS"), this.blocks.forEach(((e) => e.dxfy(t))), t.end();
  }
};
a(pn, "Rs");
let ie = pn;
const An = class An {
  dxfy(t) {
    t.start("CLASSES"), t.end();
  }
};
a(An, "Ys");
let he = An;
const yn = class yn {
  constructor(t) {
    this.blocks = t, this.modelSpace = t.modelSpace, this.paperSpace = t.paperSpace;
  }
  setLayerName(t) {
    this.modelSpace.setLayerName(t);
  }
  dxfy(t) {
    t.start("ENTITIES"), this.paperSpace.entities.forEach(((e) => e.dxfy(t))), this.modelSpace.entities.forEach(((e) => e.dxfy(t))), t.end();
  }
};
a(yn, "Bs");
let oe = yn;
const mn = class mn {
  constructor(t, e) {
    this.values = e, this.name = t;
  }
  dxfy(t) {
    t.variableName(this.name), Object.entries(this.values).forEach(((e) => {
      const [n, i] = e;
      t.push(parseInt(n), i);
    }));
  }
};
a(mn, "ws");
let de = mn;
const xn = class xn {
  constructor() {
    this.variables = [];
  }
  setVariable(t, e) {
    const n = this.variables.find(((i) => i.name === t));
    n ? n.values = e : this.variables.push(new de(t, e));
  }
  dxfy(t) {
    t.start("HEADER"), this.variables.forEach(((e) => e.dxfy(t))), t.end();
  }
};
a(xn, "Ns");
let ae = xn;
const In = class In {
  constructor(t) {
    this.type = t, this.ownerObjecthandle = "0", this.handle = F.next();
  }
  dxfy(t) {
    t.type(this.type), t.handle(this.handle), t.push(330, this.ownerObjecthandle);
  }
};
a(In, "Ms");
let Q = In;
const Sn = class Sn extends Q {
  constructor() {
    super("DICTIONARY"), this.entries = [], this.duplicateRecordCloningFlag = 0;
  }
  addEntryObject(t, e) {
    this.entries.push({ name: t, entryObjectHandle: e });
  }
  dxfy(t) {
    super.dxfy(t), t.subclassMarker("AcDbDictionary"), t.push(280, this.hardOwnerFlag), t.push(281, this.duplicateRecordCloningFlag);
    for (const e of this.entries) t.push(3, e.name), t.push(350, e.entryObjectHandle);
  }
};
a(Sn, "Ps");
let Rt = Sn;
(function(s) {
  s[s.NoUnits = 0] = "NoUnits", s[s.Centimeters = 2] = "Centimeters", s[s.Inch = 5] = "Inch";
})(Hs || (Hs = {}));
const Ln = class Ln extends Q {
  constructor(t) {
    super("IMAGEDEF"), this.path = t, this.acadImageDictHandle = "", this.imageReactorHandles = [], this.width = 1, this.height = 1, this.widthPixelSize = 1, this.heightPixelSize = 1, this.loaded = !0, this.resolutionUnits = Hs.NoUnits;
  }
  addImageDefReactorHandle(t) {
    this.imageReactorHandles.push(t);
  }
  dxfy(t) {
    super.dxfy(t);
    const e = new us("ACAD_REACTORS");
    e.add(330, this.acadImageDictHandle);
    for (const n of this.imageReactorHandles) e.add(330, n);
    e.dxfy(t), t.subclassMarker("AcDbRasterImageDef"), t.push(1, this.path), t.point2d(x(this.width, this.height)), t.push(11, this.widthPixelSize), t.push(21, this.heightPixelSize), t.push(280, Number(this.loaded)), t.push(281, this.resolutionUnits);
  }
};
a(Ln, "Os");
let le = Ln;
const Dn = class Dn extends Q {
  constructor(t) {
    super("IMAGEDEF_REACTOR"), this.imageHandle = t, this.classVersion = 2;
  }
  dxfy(t) {
    super.dxfy(t), t.subclassMarker("AcDbRasterImageDefReactor"), t.push(90, this.classVersion), t.push(330, this.imageHandle);
  }
};
a(Dn, "_s");
let re = Dn;
const bn = class bn {
  constructor() {
    this.root = new Rt(), this.objects = [], this.root.duplicateRecordCloningFlag = 1;
    const t = this.addDictionary();
    this.root.addEntryObject("ACAD_GROUP", t.handle);
  }
  addObject(t) {
    return this.objects.push(t), t;
  }
  addImageDef(t) {
    return this.addObject(new le(t));
  }
  addImageDefReactor(t) {
    return this.addObject(new re(t));
  }
  addDictionary() {
    const t = new Rt();
    return t.ownerObjecthandle = this.root.handle, this.addObject(t), t;
  }
  addEntryToRoot(t, e) {
    this.root.addEntryObject(t, e);
  }
  dxfy(t) {
    t.start("OBJECTS"), this.root.dxfy(t);
    for (const e of this.objects) e.dxfy(t);
    t.end(), t.type("EOF");
  }
};
a(bn, "Hs");
let fe = bn;
const vn = class vn {
  constructor(t) {
    this.name = t, this.maxNumberEntries = 0, this.ownerObjectHandle = "0", this.handle = F.next(), this.records = [];
  }
  dxfy(t) {
    t.type("TABLE"), t.name(this.name), t.handle(this.handle), t.push(330, this.ownerObjectHandle), t.subclassMarker("AcDbSymbolTable"), t.push(70, this.records.length);
    for (const e of this.records) e.dxfy(t);
    t.type("ENDTAB");
  }
};
a(vn, "Ws");
let E = vn;
(function(s) {
  s[s.None = 0] = "None", s[s.XRefDependent = 16] = "XRefDependent", s[s.XRefResolved = 32] = "XRefResolved";
})(Ft || (Ft = {}));
const Cn = class Cn extends Y {
  constructor(t, e) {
    super("APPID"), this.name = t, this.flags = e ?? Ft.None;
  }
  dxfy(t) {
    super.dxfy(t), t.subclassMarker("AcDbRegAppTableRecord"), t.name(this.name), t.push(70, this.flags);
  }
};
a(Cn, "Vs");
let ue = Cn;
const Xn = class Xn extends Y {
  get isPaperSpace() {
    return this.name.startsWith("*Paper_Space");
  }
  constructor(t) {
    super("BLOCK_RECORD"), this.name = t, this.insertionUnits = 0, this.explodability = 1, this.scalability = 0;
  }
  dxfy(t) {
    super.dxfy(t), t.subclassMarker("AcDbBlockTableRecord"), t.name(this.name), t.push(340, this.layoutObject), t.push(70, this.insertionUnits), t.push(280, this.explodability), t.push(281, this.scalability);
  }
};
a(Xn, "Us");
let ce = Xn;
(function(s) {
  s[s.None = 0] = "None", s[s.XRefDependent = 16] = "XRefDependent", s[s.XRefRefesolved = 32] = "XRefRefesolved";
})(ks || (ks = {}));
const Fn = class Fn {
  constructor(t, e) {
    this.name = t, this.flags = e ?? ks.None, this.handle = F.next(), this.type = "DIMSTYLE";
  }
  dxfy(t) {
    t.type(this.type), t.push(105, this.handle), t.push(330, this.ownerObjectHandle), t.subclassMarker("AcDbSymbolTableRecord"), t.subclassMarker("AcDbDimStyleTableRecord"), t.name(this.name), t.push(70, this.flags), t.push(3, this.DIMPOST), t.push(4, this.DIMAPOST), t.push(5, this.DIMBLK), t.push(6, this.DIMBLK1), t.push(7, this.DIMBLK2), t.push(40, this.DIMSCALE), t.push(41, this.DIMASZ), t.push(42, this.DIMEXO), t.push(43, this.DIMDLI), t.push(44, this.DIMEXE), t.push(45, this.DIMRND), t.push(46, this.DIMDLE), t.push(47, this.DIMTP), t.push(48, this.DIMTM), t.push(140, this.DIMTXT), t.push(141, this.DIMCEN), t.push(142, this.DIMTSZ), t.push(143, this.DIMALTF), t.push(144, this.DIMLFAC), t.push(145, this.DIMTVP), t.push(146, this.DIMTFAC), t.push(147, this.DIMGAP), t.push(148, this.DIMALTRND), t.push(71, this.DIMTOL), t.push(72, this.DIMLIM), t.push(73, this.DIMTIH), t.push(74, this.DIMTOH), t.push(75, this.DIMSE1), t.push(76, this.DIMSE2), t.push(77, this.DIMTAD), t.push(78, this.DIMZIN), t.push(79, this.DIMAZIN), t.push(170, this.DIMALT), t.push(171, this.DIMALTD), t.push(172, this.DIMTOFL), t.push(173, this.DIMSAH), t.push(174, this.DIMTIX), t.push(175, this.DIMSOXD), t.push(176, this.DIMCLRD), t.push(177, this.DIMCLRE), t.push(178, this.DIMCLRT), t.push(179, this.DIMADEC), t.push(271, this.DIMDEC), t.push(272, this.DIMTDEC), t.push(273, this.DIMALTU), t.push(274, this.DIMALTTD), t.push(275, this.DIMAUNIT), t.push(276, this.DIMFRAC), t.push(277, this.DIMLUNIT), t.push(278, this.DIMDSEP), t.push(279, this.DIMTMOVE), t.push(280, this.DIMJUST), t.push(281, this.DIMSD1), t.push(282, this.DIMSD2), t.push(283, this.DIMTOLJ), t.push(284, this.DIMTZIN), t.push(285, this.DIMALTZ), t.push(286, this.DIMALTTZ), t.push(287, this.DIMFIT), t.push(288, this.DIMUPT), t.push(289, this.DIMATFIT), t.push(340, this.DIMTXSTY), t.push(341, this.DIMLDRBLK), t.push(342, this.DIMBLK), t.push(343, this.DIMBLK1), t.push(344, this.DIMBLK2), t.push(371, this.DIMLWD), t.push(372, this.DIMLWE);
  }
};
a(Fn, "js");
let ge = Fn;
const En = class En extends Y {
  constructor(t, e, n, i) {
    super("LTYPE"), this.name = t, this.descriptive = e, this.elements = n, this.flags = i ?? 0;
  }
  dxfy(t) {
    super.dxfy(t), t.subclassMarker("AcDbLinetypeTableRecord"), t.name(this.name), t.push(70, this.flags), t.push(3, this.descriptive), t.push(72, 65), t.push(73, this.elements.length);
    let e = 0;
    for (const n of this.elements) e += Math.abs(n);
    t.push(40, e);
    for (const n of this.elements) t.push(49, n), t.push(74, 0);
  }
};
a(En, "Gs");
let pe = En;
const Rn = class Rn extends Y {
  constructor(t, e) {
    super("STYLE"), this.fixedTextHeight = 0, this.widthFactor = 1, this.obliqueAngle = 0, this.textGenerationFlag = 0, this.lastHeightUsed = 1, this.fontFileName = "txt", this.bigFontFileName = "", this.name = t, this.flags = e ?? rs.None;
  }
  dxfy(t) {
    super.dxfy(t), t.subclassMarker("AcDbTextStyleTableRecord"), t.name(this.name), t.push(70, this.flags), t.push(40, this.fixedTextHeight), t.push(41, this.widthFactor), t.push(50, this.obliqueAngle), t.push(71, this.textGenerationFlag), t.push(42, this.lastHeightUsed), t.push(3, this.fontFileName), t.push(4, this.bigFontFileName);
  }
};
a(Rn, "zs");
let Ae = Rn;
const Yn = class Yn extends Y {
  constructor(t) {
    super("UCS"), this.name = t;
  }
  dxfy(t) {
    super.dxfy(t);
  }
};
a(Yn, "Js");
let ye = Yn;
const Tn = class Tn extends Y {
  constructor(t) {
    super("VPORT"), this.name = t, this.viewHeight = 200, this.viewCenter = [0, 0];
  }
  dxfy(t) {
    super.dxfy(t);
    const [e, n] = this.viewCenter;
    t.subclassMarker("AcDbViewportTableRecord"), t.name(this.name), t.push(70, 0), t.point2d({ x: 0, y: 0 }), t.push(11, 1), t.push(21, 1), t.push(12, e), t.push(22, n), t.push(13, 0), t.push(23, 0), t.push(14, 10), t.push(24, 10), t.push(15, 10), t.push(25, 10), t.push(16, 0), t.push(26, 0), t.push(36, 1), t.push(17, 0), t.push(27, 0), t.push(37, 0), t.push(40, this.viewHeight || 200), t.push(41, 2), t.push(42, 50), t.push(43, 0), t.push(44, 0), t.push(50, 0), t.push(51, 0), t.push(71, 0), t.push(72, 100), t.push(73, 1), t.push(74, 3), t.push(75, 0), t.push(76, 1), t.push(77, 0), t.push(78, 0), t.push(281, 0), t.push(65, 1), t.push(110, 0), t.push(120, 0), t.push(130, 0), t.push(111, 1), t.push(121, 0), t.push(131, 0), t.push(112, 0), t.push(122, 1), t.push(132, 0), t.push(79, 0), t.push(146, 0), t.push(348, 10020), t.push(60, 7), t.push(61, 5), t.push(292, 1), t.push(282, 1), t.push(141, 0), t.push(142, 0), t.push(63, 250), t.push(421, 3358443);
  }
};
a(Tn, "Ks");
let me = Tn;
const Bn = class Bn extends Y {
  constructor(t) {
    var e;
    super("VIEW"), this.name = t.name, this.flags = (e = t.flags) !== null && e !== void 0 ? e : fs.None, this.viewHeight = t.viewHeight, this.viewCenter = t.viewCenter, this.viewWidth = t.viewWidth, this.viewDirection = t.viewDirection, this.targetPoint = t.targetPoint, this.lensLength = t.lensLength, this.frontClipping = t.frontClipping, this.backClipping = t.backClipping, this.twistAngle = t.twistAngle, this.viewMode = t.viewMode, this.renderMode = t.renderMode, this.isUCSAssociated = t.isUCSAssociated, this.isCameraPlottable = t.isCameraPlottable || !1, t.backgroundObjectHandle && (this.backgroundObjectHandle = t.backgroundObjectHandle), t.liveSectionObjectHandle && (this.liveSectionObjectHandle = t.liveSectionObjectHandle), t.visualStyleObjectHandle && (this.visualStyleObjectHandle = t.visualStyleObjectHandle);
  }
  dxfy(t) {
    super.dxfy(t), t.subclassMarker("AcDbViewTableRecord"), t.name(this.name), t.push(70, this.flags), t.push(40, this.viewHeight), t.point2d(this.viewCenter), t.push(41, this.viewWidth), t.push(11, this.viewDirection.x), t.push(21, this.viewDirection.y), t.push(31, this.viewDirection.z), t.push(12, this.targetPoint.x), t.push(22, this.targetPoint.y), t.push(32, this.targetPoint.z), t.push(42, this.lensLength), t.push(43, this.frontClipping), t.push(44, this.backClipping), t.push(50, this.twistAngle), t.push(71, this.viewMode), t.push(281, this.renderMode), t.push(72, this.isUCSAssociated ? 1 : 0), t.push(73, this.isCameraPlottable ? 1 : void 0), t.push(332, this.backgroundObjectHandle), t.push(334, this.liveSectionObjectHandle), t.push(348, this.visualStyleObjectHandle);
  }
};
a(Bn, "Zs");
let xe = Bn;
const wn = class wn extends E {
  constructor() {
    super("APPID");
  }
  addAppId(t, e) {
    const n = new ue(t, e);
    return n.ownerObjectHandle = this.handle, this.records.push(n), n;
  }
};
a(wn, "qs");
let Ie = wn;
const Nn = class Nn extends E {
  constructor() {
    super("BLOCK_RECORD");
  }
  addBlockRecord(t) {
    const e = new ce(t);
    return e.ownerObjectHandle = this.handle, this.records.push(e), e;
  }
};
a(Nn, "$s");
let Se = Nn;
const Mn = class Mn extends E {
  constructor() {
    super("DIMSTYLE"), this.ownerObjectHandle = "0";
  }
  addDimStyle(t, e) {
    const n = new ge(t, e);
    return n.ownerObjectHandle = this.handle, this.records.push(n), n;
  }
  dxfy(t) {
    t.type("TABLE"), t.name(this.name), t.handle(this.handle), t.push(330, this.ownerObjectHandle), t.subclassMarker("AcDbSymbolTable"), t.push(70, this.records.length), t.subclassMarker("AcDbDimStyleTable");
    for (const e of this.records) e.dxfy(t);
    t.type("ENDTAB");
  }
};
a(Mn, "Qs");
let Le = Mn;
const On = class On extends E {
  constructor() {
    super("LTYPE");
  }
  exist(t) {
    return this.records.find(((e) => e.name === t)) !== void 0;
  }
  ltype(t) {
    return this.records.find(((e) => e.name === t));
  }
  addLType(t, e, n, i) {
    const h = this.ltype(t);
    if (h) return h;
    const o = new pe(t, e, n, i);
    return o.ownerObjectHandle = this.handle, this.records.push(o), o;
  }
};
a(On, "en");
let De = On;
const Pn = class Pn extends E {
  constructor(t) {
    super("LAYER"), this.lTypeTable = t;
  }
  addLayer(t, e, n, i) {
    t = t.replace(Dt, "");
    const h = this.layer(t);
    if (h) return h;
    this.lTypeTable.exist(n) || (n = St.Continuous);
    const o = new O(t, e, n, i);
    return o.ownerObjectHandle = this.handle, this.records.push(o), o;
  }
  layer(t) {
    return t = t.replace(Dt, ""), this.records.find(((e) => e.name === t));
  }
  exist(t) {
    return this.records.find(((e) => e.name === t)) !== void 0;
  }
};
a(Pn, "tn");
let be = Pn;
const _n = class _n extends E {
  constructor() {
    super("STYLE");
  }
  addStyle(t, e) {
    const n = new Ae(t, e);
    return n.ownerObjectHandle = this.handle, this.records.push(n), n;
  }
};
a(_n, "sn");
let ve = _n;
const Hn = class Hn extends E {
  constructor() {
    super("UCS");
  }
  addUcs(t) {
    const e = new ye(t);
    return e.ownerObjectHandle = this.handle, this.records.push(e), e;
  }
};
a(Hn, "nn");
let Ce = Hn;
const kn = class kn extends E {
  constructor() {
    super("VPORT");
  }
  addViewPort(t) {
    const e = new me(t);
    return e.ownerObjectHandle = this.handle, this.records.push(e), e;
  }
};
a(kn, "hn");
let Xe = kn;
const Wn = class Wn extends E {
  constructor() {
    super("VIEW");
  }
  addView(t) {
    const e = new xe(t);
    return e.ownerObjectHandle = this.handle, this.records.push(e), e;
  }
};
a(Wn, "on");
let Fe = Wn;
const Vn = class Vn {
  constructor() {
    this.vPortTable = new Xe(), this.ltypeTable = new De(), this.layerTable = new be(this.ltypeTable), this.styleTable = new ve(), this.viewTable = new Fe(), this.ucsTable = new Ce(), this.appIdTable = new Ie(), this.dimStyleTable = new Le(), this.blockRecordTable = new Se();
  }
  layer(t) {
    return this.layerTable.layer(t);
  }
  addLType(t, e, n, i) {
    return this.ltypeTable.addLType(t, e, n, i);
  }
  addBlockRecord(t) {
    return this.blockRecordTable.addBlockRecord(t);
  }
  addLayer(t, e, n, i) {
    return this.layerTable.addLayer(t, e, n, i);
  }
  addStyle(t) {
    return this.styleTable.addStyle(t);
  }
  addView(t) {
    return this.viewTable.addView(t);
  }
  addUcs(t) {
    return this.ucsTable.addUcs(t);
  }
  addAppId(t, e) {
    return this.appIdTable.addAppId(t, e);
  }
  addDimStyle(t, e) {
    return this.dimStyleTable.addDimStyle(t, e);
  }
  addVPort(t) {
    return this.vPortTable.addViewPort(t);
  }
  dxfy(t) {
    t.start("TABLES"), this.vPortTable.dxfy(t), this.ltypeTable.dxfy(t), this.layerTable.dxfy(t), this.styleTable.dxfy(t), this.viewTable.dxfy(t), this.ucsTable.dxfy(t), this.appIdTable.dxfy(t), this.dimStyleTable.dxfy(t), this.blockRecordTable.dxfy(t), t.end();
  }
};
a(Vn, "dn");
let Ee = Vn;
const Un = class Un {
  constructor() {
    F.clear(), this.header = new ae(), this.classes = new he(), this.tables = new Ee(), this.objects = new fe(), this.blocks = new ie(this.tables, this.objects), this.entities = new oe(this.blocks), this.currentLayerName = O.layerZeroName, this.currentUnits = It.Unitless, this.header.setVariable("$ACADVER", { 1: "AC1021" }), this.header.setVariable("$LASTSAVEDBY", { 1: "@tarikjabiri/dxf" }), this._handseed(), this.setUnits(It.Unitless), this.tables.addLType("ByBlock", "", []), this.tables.addLType("ByLayer", "", []);
    const t = this.tables.addLType("Continuous", "Solid line", []);
    this.tables.addLayer(O.layerZeroName, gs.White, t.name), this.styleStandard = this.tables.addStyle("Standard"), this.tables.addAppId("ACAD", Ft.None), this.dimStyleStandard = this.tables.addDimStyle("Standard"), this.dimStyleStandard.DIMTXSTY = this.styleStandard.handle, this.activeVPort = this.tables.addVPort("*Active"), this.modelSpace = this.blocks.modelSpace, this.paperSpace = this.blocks.paperSpace, this.setZeroLayerAsCurrent();
  }
  dxfy(t) {
    this.header.dxfy(t), this.classes.dxfy(t), this.tables.dxfy(t), this.blocks.dxfy(t), this.entities.dxfy(t), this.objects.dxfy(t);
  }
  addBlock(t) {
    return this.blocks.addBlock(t, this.objects);
  }
  setZeroLayerAsCurrent() {
    this.setCurrentLayerName(O.layerZeroName);
  }
  setCurrentLayerName(t) {
    this.currentLayerName = t.replace(Dt, ""), this.entities.setLayerName(this.currentLayerName), this.setCLayerVariable();
  }
  _handseed() {
    this.header.setVariable("$HANDSEED", { 5: F.peek() });
  }
  setUnits(t) {
    this.currentUnits = t, this.header.setVariable("$INSUNITS", { 70: this.currentUnits });
  }
  setCLayerVariable() {
    this.header.setVariable("$CLAYER", { 8: this.currentLayerName });
  }
  setViewCenter(t) {
    this.header.setVariable("$VIEWCTR", { 10: t.x, 20: t.y }), this.activeVPort.viewCenter = [t.x, t.y];
  }
  stringify() {
    const t = new cs();
    return this._handseed(), this.setViewCenter(this.modelSpace.centerView()), this.activeVPort.viewHeight = this.modelSpace.viewHeight(), this.dxfy(t), t.stringify();
  }
};
a(Un, "an");
let Re = Un;
const jn = class jn {
  get header() {
    return this.document.header;
  }
  get tables() {
    return this.document.tables;
  }
  get blocks() {
    return this.document.blocks;
  }
  get entities() {
    return this.document.entities;
  }
  get currentLayer() {
    return this.document.currentLayerName;
  }
  get units() {
    return this.document.currentUnits;
  }
  get modelSpace() {
    return this.document.modelSpace;
  }
  constructor() {
    this.document = new Re();
  }
  layer(t) {
    return this.tables.layer(t);
  }
  setZeroLayerAsCurrent() {
    this.document.setZeroLayerAsCurrent();
  }
  addBlock(t) {
    return this.blocks.addBlock(t, this.document.objects);
  }
  addPaperSpace() {
    return this.blocks.addPaperSpace();
  }
  setVariable(t, e) {
    this.header.setVariable(t, e);
  }
  addLType(t, e, n) {
    return this.tables.addLType(t, e, n);
  }
  addDimStyle(t) {
    return this.tables.addDimStyle(t);
  }
  addAlignedDim(t, e, n) {
    return this.modelSpace.addAlignedDim(t, e, n);
  }
  addDiameterDim(t, e, n) {
    return this.modelSpace.addDiameterDim(t, e, n);
  }
  addRadialDim(t, e, n) {
    return this.modelSpace.addRadialDim(t, e, n);
  }
  addLinearDim(t, e, n) {
    return this.modelSpace.addLinearDim(t, e, n);
  }
  addAngularLinesDim(t, e, n, i) {
    return this.modelSpace.addAngularLinesDim(t, e, n, i);
  }
  addHatch(t, e, n) {
    return this.modelSpace.addHatch(t, e, n);
  }
  addLayer(t, e, n, i = xt.None) {
    return n || (n = St.Continuous), this.tables.addLayer(t, e, n, i);
  }
  setCurrentLayerName(t) {
    this.document.setCurrentLayerName(t);
  }
  setUnits(t) {
    this.document.setUnits(t);
  }
  addLine(t, e, n) {
    return this.modelSpace.addLine(t, e, n);
  }
  addLeader(t, e) {
    return this.modelSpace.addLeader(t, e);
  }
  addLWPolyline(t, e) {
    return this.modelSpace.addLWPolyline(t, e);
  }
  addRectangle(t, e, n) {
    return this.modelSpace.addRectangle(t, e, n);
  }
  addPolyline3D(t, e) {
    return this.modelSpace.addPolyline3D(t, e);
  }
  addPoint(t, e, n, i) {
    return this.modelSpace.addPoint(t, e, n, i);
  }
  addCircle(t, e, n) {
    return this.modelSpace.addCircle(t, e, n);
  }
  addArc(t, e, n, i, h) {
    return this.modelSpace.addArc(t, e, n, i, h);
  }
  addSpline(t, e) {
    return this.modelSpace.addSpline(t, e);
  }
  addEllipse(t, e, n, i, h, o) {
    return this.modelSpace.addEllipse(t, e, n, i, h, o);
  }
  addImage(t, e, n, i, h, o, r, f) {
    return this.modelSpace.addImage(t, e, n, i, h, o, r, f);
  }
  add3dFace(t, e, n, i, h) {
    return this.modelSpace.add3dFace(t, e, n, i, h);
  }
  addText(t, e, n, i) {
    return this.modelSpace.addText(t, e, n, i);
  }
  addAttdef(t, e, n, i, h) {
    return this.modelSpace.addAttdef(t, e, n, i, h);
  }
  addAttrib(t, e, n, i, h, o) {
    return this.modelSpace.addAttrib(t, e, n, i, h, o);
  }
  addMText(t, e, n, i) {
    return this.modelSpace.addMText(t, e, n, i);
  }
  addInsert(t, e, n) {
    return this.modelSpace.addInsert(t, e, n);
  }
  addTable(t, e, n, i, h, o, r) {
    return this.modelSpace.addTable(t, e, n, i, h, o, r);
  }
  stringify() {
    return this.document.stringify();
  }
};
a(jn, "ln");
let bi = jn;
export {
  Ct as H,
  bi as l,
  gs as m,
  A as t,
  It as x
};
