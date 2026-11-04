const React = require("react");
module.exports = { __esModule: true, default: function Image(props) { const { src, alt, fill, priority, ...rest } = props; return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }); } };
