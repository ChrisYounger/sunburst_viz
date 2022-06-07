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
            viz.instance_id = "sunburst_viz_" + Math.round(Math.random() * 1000000);
            var theme = 'light'; 
            if (typeof vizUtils.getCurrentTheme === "function") {
                theme = vizUtils.getCurrentTheme();
            }
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
                coloroverride: "",
                labelwidth: "100",
                labelcolor: "#000000",
                colormode: "root",
                color: "schemeCategory10",
                nulltoken: "",
                maxrows: "1500"
            };
            // Override defaults with selected items from the UI
            for (var opt in config) {
                if (config.hasOwnProperty(opt)) {
                    viz.config[ opt.replace(viz.getPropertyNamespaceInfo().propertyNamespace,'') ] = config[opt];
                }
            }
            viz.config._coloroverride = {};
            if (viz.config.coloroverride.substr(0,1) === "{") {
                try{ viz.config._coloroverride = JSON.parse(viz.config.coloroverride); } catch(e) {}
            } else {
                var parts = viz.config.coloroverride.split(",");
                for (var i = 0; i+1 < parts.length; i+=2) {
                    viz.config._coloroverride[parts[i]] = parts[i+1];
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

        getColor: function(elements) {
            var viz = this;
            if (viz.config.color.substr(0,1) === "s") {
                return d3.scaleOrdinal(d3[viz.config.color]);
            } else {
                var c = d3.scaleOrdinal(d3.quantize(d3[viz.config.color], Math.round((elements + 1) * 1.25)));
                // waste a bunch of colors, the first third are too dim to see
                for (var i = 0; i <= Math.round((elements + 1) * 0.2); i++) { c("sunburst_viz_" + i); }
                return c;
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
            for (var l = 0; l < viz.data.rows.length; l++) {
                total += Number(viz.data.rows[l][viz.data.rows[l].length-1]);
            }
            var skippedRows = 0;
            var validRows = 0;
            var data = {"name": "root", "children": []};
            var drilldown, i, k;
            viz.valueFieldName = "";
            if (viz.data.fields.length > 1) {
                viz.valueFieldName = viz.data.fields[viz.data.fields.length-1].name;
            }
            for (i = 0; i < viz.data.rows.length; i++) {
                var parts = viz.data.rows[i].slice();
                var nodesize = parts.pop();
                if (nodesize === "" || nodesize === null || isNaN(Number(nodesize))) {
                    skippedRows++;
                    continue;
                } else {
                    validRows++;
                }
                while (parts[parts.length-1] === null || parts[parts.length-1] === "") {
                    parts.pop();
                }
                var currentNode = data;
                for (var j = 0; j < parts.length; j++) {
                    var children = currentNode.children;
                    var nodeName = parts[j];
                    var childNode;
                    if (j + 1 < parts.length) {
                        // Not yet at the end of the sequence; move down the tree.
                        var foundChild = false;
                        for (k = 0; k < children.length; k++) {
                            if (children[k].name == nodeName && typeof children[k].children !== "undefined") {
                                childNode = children[k];
                                foundChild = true;
                                break;
                            }
                        }
                        // If we don't already have a child node for this branch, create it.
                        if (!foundChild) {
                            drilldown = {};
                            for (k = 0; k <= j; k++) {
                                drilldown[viz.data.fields[k].name] = viz.data.rows[i][k];
                            }
                            childNode = {"name": nodeName, "drilldown": drilldown, "children": []};
                            children.push(childNode);
                        }
                        currentNode = childNode;
                    } else {
                        drilldown = {};
                        for (k = 0; k < viz.data.rows[i].length - 1; k++) {
                            drilldown[viz.data.fields[k].name] = viz.data.rows[i][k];
                        }
                        // Reached the end of the sequence; create a leaf node.
                        childNode = {"name": nodeName, "drilldown": drilldown, "value": nodesize};
                        children.push(childNode);
                    }
                }
            }
            if (skippedRows) {
                console.log("Rows skipped because last column is not numeric: ", skippedRows);
            }
            if (skippedRows && ! validRows) {
                viz.$container_wrap.empty().append("<div class='sunburst_viz-bad_data'>Last column of data must contain numeric values.<br /><a href='/app/sunburst_viz/documentation' target='_blank'>Examples and Documentation</a></div>");
                return;
            }
            if (viz.data.fields.length <= 1) {
                viz.$container_wrap.empty().append("<div class='sunburst_viz-bad_data'>There must be at least 1 column of labels.<br /><a href='/app/sunburst_viz/documentation' target='_blank'>Examples and Documentation</a></div>");
                return;
            }
            if (validRows > Number(viz.config.maxrows)) {
                viz.$container_wrap.empty().append("<div class='sunburst_viz-bad_data'>Too many rows of data. Increase limit in formatting settings. (Total rows:" + validRows + ", Limit: " + viz.config.maxrows + "). </div>");
                return;
            }
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
                var parts = d.ancestors().map(function(d) { return d.data.name; }).reverse();
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
                viz.container_wrap_offset = viz.$container_wrap.offset();
                return tooltip.css("visibility", "visible").html(tt);
            }

            // we move tooltip during of "mousemove"
            function tooltipMove(event) {
                return tooltip.css({"top": (event.pageY - viz.container_wrap_offset.top - 30) + "px", "left": (event.pageX - viz.container_wrap_offset.left + 20) + "px"});
            }

            // we hide our tooltip on "mouseout"
            function tooltiphide() {
                return tooltip.css("visibility", "hidden");
            }

            function clicked(p) {
                if (p.parent === null) {
                    parent.style("cursor", "default");
                } else {
                    parent.style("cursor", "pointer");
                }
                parent.datum(p.parent || root);

                root.each(function(d) { 
                    d.target = {
                        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
                        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
                        y0: Math.max(0, d.y0 - p.depth),
                        y1: Math.max(0, d.y1 - p.depth)
                    };
                    return d.target;
                });
                var trans = g.transition().duration(750);
                // Transition the data on all arcs, even the ones that aren’t visible,
                // so that if this transition is interrupted, entering arcs will start
                // the next transition from the desired position.
                path.transition(trans)
                    .tween("data", function(d) {
                        var i = d3.interpolate(d.current, d.target);
                        return function(t) {
                            d.current = i(t);
                            return d.current; 
                        };
                    })
                    .filter(function(d) {
                        return +this.getAttribute("fill-opacity") || arcVisible(d.target);
                    })
                    .attr("fill-opacity", function(d) { return arcVisible(d.target) ? (d.children ? 0.8 : 0.6) : 0; })
                    .attrTween("d", function(d) { 
                        return function() { return arc(d.current); };
                    });
                label.filter(function(d) {
                    return +this.getAttribute("fill-opacity") || labelVisible(d.target);
                })
                .transition(trans)
                .attr("fill-opacity", function(d) { return +labelVisible(d.target); })
                .attrTween("transform", function(d) { 
                    return function() { return labelTransform(d.current); };
                });
            }

            function arcVisible(d) {
                return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
            }

            function labelVisible(d) {
                return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
            }

            function labelTransform(d) {
                var x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
                var y = (d.y0 + d.y1) / 2 * radius;
                return "rotate(" + (x - 90) + ") translate(" + y + ",0) rotate(" + (x < 180 ? 0 : 180) + ")";
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
            
            var root;

            if (viz.config.mode === "zoomable") {
                // https://observablehq.com/@d3/zoomable-sunburst
                radius = width / 6;
                partition = function(data) {
                    var r = d3.hierarchy(data)
                        .sum(function(d) { return d.value; })
                        .sort(function(a, b) { return b.value - a.value; });
                    return d3.partition().size([2 * Math.PI, r.height + 1])(r);
                };
                color = viz.getColor(viz.data.rows.length);
                arc = d3.arc()
                    .startAngle(function(d) { return d.x0; })
                    .endAngle(function(d) { return d.x1; })
                    .padAngle(function(d) { return Math.min((d.x1 - d.x0) / 2, 0.005); })
                    .padRadius(radius * 1.5)
                    .innerRadius(function(d) { return d.y0 * radius; })
                    .outerRadius(function(d) { return Math.max(d.y0 * radius, d.y1 * radius - 1); });
                root = partition(data);
                root.each(function(d) { d.current = d; return d.current; });
                var g = svg.append("g")
                    .attr("transform", "translate(" + (width / 2) + "," + (width / 2) + ")");
                var path = g.append("g")
                .selectAll("path")
                .data(root.descendants().slice(1))
                .join("path")
                    .attr("fill", function(d) {
                        if (viz.config._coloroverride.hasOwnProperty(d.data.name)) {
                            return viz.config._coloroverride[d.data.name];
                        }
                        if (viz.config.colormode === "root") {
                            while (d.depth > 1) d = d.parent; return color(d.data.name);
                        }
                        if (viz.config.colormode === "parent") {
                            return color(d.parent.data.name);
                        }
                        return color(d.data.name);
                    })
                    .attr("fill-opacity", function(d) { return arcVisible(d.current) ? (d.children ? 1 : 0.8) : 0; })
                    .attr("d", function(d) { return arc(d.current); });

                path.filter(function(d) { return d.children; })
                    .style("cursor", "pointer")
                    .on("click", clicked);

                path.on("mouseover", function(d) { if (arcVisible(d.current)) { tooltipCreate(d); }})
                    .on("mousemove", function() { tooltipMove(event);})
                    .on("mouseout", tooltiphide);

                var label = g.append("g")
                    .attr("pointer-events", "none")
                    .attr("text-anchor", "middle")
                    .style("user-select", "none")
                    .attr("fill", viz.config.labelcolor)
                .selectAll("text")
                .data(root.descendants().slice(1))
                .join("text")
                    .attr("dy", "0.35em")
                    .attr("fill-opacity", function(d) { return +labelVisible(d.current); })
                    .attr("transform", function(d) { return labelTransform(d.current); })
                    .text(function(d) { if (viz.config.labels === "show") {return d.data.name; } else {return ""; }})
                    .each( textwrap );
                var parent = g.append("circle")
                    .datum(root)
                    .attr("r", radius)
                    .attr("fill", "none")
                    .attr("pointer-events", "all")
                    .on("click", clicked);

            } else {
                // https://observablehq.com/@d3/sunburst
                radius = width / 2;
                partition = function(data) { 
                    return d3.partition()
                        .size([2 * Math.PI, radius])
                    (d3.hierarchy(data)
                        .sum(function(d) { return d.value; })
                        .sort(function(a, b) { return b.value - a.value; })); 
                };
                color = viz.getColor(viz.data.rows.length);
                arc = d3.arc()
                    .startAngle(function(d) { return d.x0; })
                    .endAngle(function(d) { return d.x1; })
                    .padAngle(function(d) { return Math.min((d.x1 - d.x0) / 2, 0.005); })
                    .padRadius(radius / 2)
                    .innerRadius(function(d) { return d.y0; })
                    .outerRadius(function(d) { return d.y1 - 1; });
                root = partition(data);
                var node = svg.append("g")
                    //.attr("fill-opacity", 0.8)
                    .selectAll("path")
                    .data(root.descendants().filter(function(d) { return d.depth; }))
                    .enter().append("path")
                        .attr("fill", function(d) {
                            if (viz.config._coloroverride.hasOwnProperty(d.data.name)) {
                                return viz.config._coloroverride[d.data.name];
                            }
                            if (viz.config.colormode === "root") {
                                while (d.depth > 1) d = d.parent; return color(d.data.name);
                            }
                            if (viz.config.colormode === "parent") {
                                return color(d.parent.data.name);
                            }
                            return color(d.data.name);
                        })
                        .attr("d", arc)
                        .on("mouseover", tooltipCreate)
                        .on("mousemove", function() { tooltipMove(event);})
                        .on("mouseout", tooltiphide);

                if (viz.config.mode === "token" || viz.config.mode === "drilldown") {
                    node.style("cursor", "pointer")
                        .on("click", function(d){
                            var defaultTokenModel = splunkjs.mvc.Components.get('default');
                            var submittedTokenModel = splunkjs.mvc.Components.get('submitted');
                            var drilldown_obj = {};
                            for (var i = 0; i < viz.data.fields.length; i++) {
                                if (viz.valueFieldName !== viz.data.fields[i].name) {
                                    var tokenName = "sunburst_viz_" + viz.data.fields[i].name;
                                    if (d.data.drilldown.hasOwnProperty(viz.data.fields[i].name)) {
                                        drilldown_obj[tokenName] = d.data.drilldown[viz.data.fields[i].name];
                                    } else {
                                        drilldown_obj[tokenName] = viz.config.nulltoken;
                                    }
                                    console.log("Setting token $" +  tokenName + "$ to", drilldown_obj[tokenName]);
                                    if (defaultTokenModel) {
                                        defaultTokenModel.set(tokenName, drilldown_obj[tokenName]);
                                    }
                                    if (submittedTokenModel) {
                                        submittedTokenModel.set(tokenName, drilldown_obj[tokenName]);
                                    }
                                }
                            }
                            viz.drilldown({
                                action: SplunkVisualizationBase.FIELD_VALUE_DRILLDOWN,
                                data: drilldown_obj
                            }, event);
                        });
                }
                svg.append("g")
                    .attr("pointer-events", "none")
                    .attr("text-anchor", "middle")
                    .attr("fill", viz.config.labelcolor)
                .selectAll("text")
                .data(root.descendants().filter(function(d) { return d.depth && (d.y0 + d.y1) / 2 * (d.x1 - d.x0) > 10; }))
                .enter().append("text")
                    .attr("transform", function(d) {
                        var x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
                        var y = (d.y0 + d.y1) / 2;
                        return "rotate(" + (x - 90) + ") translate(" + y + ",0) rotate(" + (x < 180 ? 0 : 180) + ")";
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