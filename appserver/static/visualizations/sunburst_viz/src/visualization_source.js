define([
    'jquery',
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils',
    'd3'
],
function(
    $,
    SplunkVisualizationBase,
    vizUtils,
    d3
) {
    // An excellent explaination walk-through of d3 https://bl.ocks.org/denjn5/e1cdbbe586ac31747b4a304f8f86efa5

    var vizObj = {
        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            var viz = this;
            viz.instance_id = Math.round(Math.random() * 1000000);
            var theme = 'light'; 
            if (typeof vizUtils.getCurrentTheme === "function") {
                theme = vizUtils.getCurrentTheme();
            }
            // TODO dark mode
            viz.colors = ["#006d9c", "#4fa484", "#ec9960", "#af575a", "#b6c75a", "#62b3b2"];
            if (typeof vizUtils.getColorPalette === "function") {
                viz.colors = vizUtils.getColorPalette("splunkCategorical", theme);
            }
            viz.$container_wrap = $(viz.el);
            viz.$container_wrap.addClass("sunburst_viz-container");
        },

        formatData: function(data) {
            return data;
        },

        updateView: function(data, config) {
            var viz = this;
            viz.config = {
                mode: "static", 
                labels: "show",
                breadcrumbs: "hide",
                labelsize: "100",
                labelwidth: "100",
                labelcolor: "#000000",
                color: "schemeCategory10"
            };
            // Override defaults with selected items from the UI
            for (var opt in config) {
                if (config.hasOwnProperty(opt)) {
                    viz.config[ opt.replace(viz.getPropertyNamespaceInfo().propertyNamespace,'') ] = config[opt];
                }
            }
            viz.data = data;
            viz.scheduleDraw();
        },

        // debounce the draw
        scheduleDraw: function(){
            var viz = this;
            clearTimeout(viz.drawtimeout);
            viz.drawtimeout = setTimeout(function(){
                viz.doDraw();
            }, 300);
        },

        buildHierarchy: function(row) {
            var root = {"name": "root", "children": []};
            for (var i = 0; i < row.length; i++) {
                var parts = row[i].slice();
                var size = parts.pop();
                while (parts[parts.length-1] === null || parts[parts.length-1] === "") {
                    parts.pop();
                }
                var currentNode = root;
                for (var j = 0; j < parts.length; j++) {
                    var children = currentNode.children;
                    var nodeName = parts[j];
                    var childNode;
                    if (j + 1 < parts.length) {
                        // Not yet at the end of the sequence; move down the tree.
                        var foundChild = false;
                        for (var k = 0; k < children.length; k++) {
                            if (children[k].name == nodeName) {
                                childNode = children[k];
                                foundChild = true;
                                break;
                            }
                        }
                        // If we don't already have a child node for this branch, create it.
                        if (!foundChild) {
                            childNode = {"name": nodeName, "children": []};
                            children.push(childNode);
                        }
                        currentNode = childNode;
                    } else {
                        // Reached the end of the sequence; create a leaf node.
                        childNode = {"name": nodeName, "value": size};
                        children.push(childNode);
                    }
                }
            }
            return root;
        },
        getColor: function(elements) {
            var viz = this;
            if (viz.config.color.substr(0,1) === "s") {
                return d3.scaleOrdinal(d3[viz.config.color]);
            } else {
                return d3.scaleOrdinal(d3.quantize(d3[viz.config.color], elements + 1));
            }
        },
        doDraw: function(){
            var viz = this;
            // Dont draw unless this is a real element under body
            if (! viz.$container_wrap.parents().is("body")) {
                return;
            }
            if (!(viz.$container_wrap.height() > 0)) {
                return;
            }
            var total = 0;
            for (var i = 0; i < viz.data.rows.length; i++) {
                total += Number(viz.data.rows[i][viz.data.rows[i].length-1]);
            }
            var data = viz.buildHierarchy(viz.data.rows);
            var svg;
            var labelsize = Number(viz.config.labelsize) / 100 * 16;

            function textwrap(d) {
                var self = d3.select(this),
                    textLength = self.node().getComputedTextLength(),
                    text = self.text();
                // on the first iteration,  make a better estimated guess of the probable line length.
                if (( textLength > Number(viz.config.labelwidth)) && text.length > 0) {
                    var chars = Number(viz.config.labelwidth) / (textLength / text.length);
                    text = text.slice(0, Math.ceil(chars * 1.05 + 1));
                    self.text(text + '…');
                    textLength = self.node().getComputedTextLength();
                }
                while ( ( textLength > Number(viz.config.labelwidth)) && text.length > 0) {
                    text = text.slice(0, -1);
                    self.text(text + '…');
                    textLength = self.node().getComputedTextLength();
                }
            }
            function tooltipCreate(d) {
                var parts = d.ancestors().map(d => d.data.name).reverse();
                var crumbs = [$("<div class='sunburst_viz-first'></div>")];
                var tt = $("<div></div>");
                for (var i = 1; i < parts.length; i++) {
                    $("<span></span>").text(parts[i]).appendTo(tt);
                    crumbs.push($("<div class='sunburst_viz-crumb'></div>") /*.css("background-color", color(d.data.name)) */ .text(parts[i]));
                    if (i < (parts.length - 1)) {
                        $("<span class='sunburst_viz-tooltip-divider'> / </span>").appendTo(tt);
                    }
                }
                if (viz.config.breadcrumbs === "show") {
                    breadcrumbs.html(crumbs);
                    clearTimeout(viz.breadcrumbTimeout);
                    viz.breadcrumbTimeout = setTimeout(function(){ breadcrumbs.empty(); },5000);
                }
                $("<div></div>").text(format(d.value) + " - " + Math.round(d.value / total * 10000) / 100 + " %").appendTo(tt);
                var clientRectangle = svg_node[0].getBoundingClientRect();
                var clientRectangleWrap = viz.$container_wrap[0].getBoundingClientRect();
                viz.widthOffset = clientRectangle.x - clientRectangleWrap.x;
                return tooltip.css("visibility", "visible").html(tt);
            }
            // we move tooltip during of "mousemove"
            function tooltipMove(event) {
                return tooltip.css("top", (event.offsetY - 30) + "px").css("left", (event.offsetX + viz.widthOffset + 20) + "px"); // 
            }
            // we hide our tooltip on "mouseout"
            function tooltiphide() {
                return tooltip.css("visibility", "hidden");
            }
            
            var format = d3.format(",d");
            var width = 800;
            var radius, color, arc, partition;
            svg = d3.create("svg")
                .style("font", labelsize + "px sans-serif")
                .style("box-sizing", "border-box");
            if (viz.config.mode === "zoomable") {
                svg.attr("viewBox", [0, 0, width, width]);
            } else {
                svg.attr("viewBox", [-0.5 * width, -0.5 * width, width, width]);
            }
            
            viz.$container_wrap.empty().append(svg.node());
            var svg_node = viz.$container_wrap.children();
            var size = Math.min(viz.$container_wrap.height(),viz.$container_wrap.width());
            svg.attr("width", (size - 20) + "px").attr("height", (size - 20) + "px");
            var tooltip = $("<div class='sunburst_viz-tooltip'></div>");
            var breadcrumbs = $("<div class='sunburst_viz-breakcrumbs'></div>");
            viz.$container_wrap.append(tooltip, breadcrumbs);

            if (viz.config.mode === "zoomable") {
                // https://observablehq.com/@d3/zoomable-sunburst
                radius = width / 6;
                partition = data => {
                    const root = d3.hierarchy(data)
                        .sum(d => d.value)
                        .sort((a, b) => b.value - a.value);
                    return d3.partition()
                        .size([2 * Math.PI, root.height + 1])
                        (root);
                };
                color = viz.getColor(data.children.length);
                arc = d3.arc()
                    .startAngle(d => d.x0)
                    .endAngle(d => d.x1)
                    .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
                    .padRadius(radius * 1.5)
                    .innerRadius(d => d.y0 * radius)
                    .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));
                const root = partition(data);
                root.each(d => d.current = d);
                const g = svg.append("g")
                    .attr("transform", `translate(${width / 2},${width / 2})`);
                const path = g.append("g")
                .selectAll("path")
                .data(root.descendants().slice(1))
                .join("path")
                    .attr("fill", d => { while (d.depth > 1) d = d.parent; return color(d.data.name); })
                    .attr("fill-opacity", d => arcVisible(d.current) ? (d.children ? 0.8 : 0.6) : 0)
                    .attr("d", d => arc(d.current));

                path.filter(d => d.children)
                    .style("cursor", "pointer")
                    .on("click", clicked);

                path.on("mouseover", function(d) { if (arcVisible(d.current)) { tooltipCreate(d); }})
                    .on("mousemove", function() { tooltipMove(event);})
                    .on("mouseout", tooltiphide);

                const label = g.append("g")
                    .attr("pointer-events", "none")
                    .attr("text-anchor", "middle")
                    .style("user-select", "none")
                    .attr("fill", viz.config.labelcolor)
                .selectAll("text")
                .data(root.descendants().slice(1))
                .join("text")
                    .attr("dy", "0.35em")
                    .attr("fill-opacity", d => +labelVisible(d.current))
                    .attr("transform", d => labelTransform(d.current))
                    .text(function(d) { if (viz.config.labels === "show") {return d.data.name; } else {return ""; }})
                    .each( textwrap );
                const parent = g.append("circle")
                    .datum(root)
                    .attr("r", radius)
                    .attr("fill", "none")
                    .attr("pointer-events", "all")
                    .on("click", clicked);

                function clicked(p) {
                    if (p.parent === null) {
                        parent.style("cursor", "default");
                    } else {
                        parent.style("cursor", "pointer");
                    }
                    parent.datum(p.parent || root);

                    root.each(d => d.target = {
                        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
                        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
                        y0: Math.max(0, d.y0 - p.depth),
                        y1: Math.max(0, d.y1 - p.depth)
                    });

                    const t = g.transition().duration(750);

                    // Transition the data on all arcs, even the ones that aren’t visible,
                    // so that if this transition is interrupted, entering arcs will start
                    // the next transition from the desired position.
                    path.transition(t)
                        .tween("data", d => {
                            const i = d3.interpolate(d.current, d.target);
                            return t => d.current = i(t);
                        })
                        .filter(function(d) {
                            return +this.getAttribute("fill-opacity") || arcVisible(d.target);
                        })
                        .attr("fill-opacity", d => arcVisible(d.target) ? (d.children ? 0.6 : 0.4) : 0)
                        .attrTween("d", d => () => arc(d.current));

                    label.filter(function(d) {
                        return +this.getAttribute("fill-opacity") || labelVisible(d.target);
                    }).transition(t)
                    .attr("fill-opacity", d => +labelVisible(d.target))
                    .attrTween("transform", d => () => labelTransform(d.current));
                }
                function arcVisible(d) {
                    return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
                }
                function labelVisible(d) {
                    return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
                }
                function labelTransform(d) {
                    const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
                    const y = (d.y0 + d.y1) / 2 * radius;
                    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
                }

            } else {
                // https://observablehq.com/@d3/sunburst
                radius = width / 2;
                partition = data => d3.partition()
                        .size([2 * Math.PI, radius])
                    (d3.hierarchy(data)
                        .sum(d => d.value)
                        .sort((a, b) => b.value - a.value));
                color = viz.getColor(data.children.length);
                arc = d3.arc()
                    .startAngle(d => d.x0)
                    .endAngle(d => d.x1)
                    .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
                    .padRadius(radius / 2)
                    .innerRadius(d => d.y0)
                    .outerRadius(d => d.y1 - 1);
                const root = partition(data);
                svg.append("g")
                    .attr("fill-opacity", 0.8)
                .selectAll("path")
                .data(root.descendants().filter(d => d.depth))
                .enter().append("path")
                    .attr("fill", d => { while (d.depth > 1) d = d.parent; return color(d.data.name); })
                    .attr("d", arc)
                    .on("mouseover", tooltipCreate)
                    .on("mousemove", function() { tooltipMove(event);})
                    .on("mouseout", tooltiphide);
                svg.append("g")
                    .attr("pointer-events", "none")
                    .attr("text-anchor", "middle")
                    .attr("fill", viz.config.labelcolor)
                .selectAll("text")
                .data(root.descendants().filter(d => d.depth && (d.y0 + d.y1) / 2 * (d.x1 - d.x0) > 10))
                .enter().append("text")
                    .attr("transform", function(d) {
                        const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
                        const y = (d.y0 + d.y1) / 2;
                        return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
                    })
                    .attr("dy", "0.35em")
                    .text(function(d) { if (viz.config.labels === "show") {return d.data.name; } else {return ""; }})
                    .each( textwrap );
            }
        },

        // Override to respond to re-sizing events
        reflow: function() {
            this.scheduleDraw();
        },

        // Search data params
        getInitialDataParams: function() {
            return ({
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 10000
            });
        },
    };
    return SplunkVisualizationBase.extend(vizObj);
});