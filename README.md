# Sunburst viz

Configurable Sunburst visualization that is easy to use. Built using D3. Has tooltips, optional breadcrumbs, label customisations and numerous color schemes. Works in dark-mode. Sunburst charts are useful to display hierarchical data.

Copyright (C) 2019 Chris Younger. I am a Splunk Professional Services consultant working for JDS Australia, in Brisbane Australia.

<a href="https://splunkbase.splunk.com/app/4550/">Splunkbase</a> | [Source code](https://github.com/ChrisYounger/sunburst_viz) |  [Questions, Bugs or Suggestions](https://answers.splunk.com/app/questions/4550.html) | [My Splunk apps](https://splunkbase.splunk.com/apps/#/author/chrisyoungerjds)


![screenshot](https://raw.githubusercontent.com/ChrisYounger/sunburst_viz/master/static/demo.png)



## Usage
 
This visualisation expects tablular data, with any amount of text/category columns, but the last column should be the numerical value. Null or blank columns are allowed before the final column to create a more "sunburst-y" visualization.

The typical search uses `stats` command like so:
```
index=* | stats count BY index sourcetype source
```

Sidenode: a much faster search to do the same thing is 
```
|tstats count where index=* BY index sourcetype source
```

Note that `stats` does not return rows when the group BY field is `null`. Use this one simple trick to convert nulls to be an empty string instead:

```
index=_internal | eval component = coalesce(component,"") | eval log_level = coalesce(log_level,"") | stats count by sourcetype component log_level
```

Add more fields after the "BY" keyword to increase the depth of the sunburst





## Formatting options

![screenshot](https://raw.githubusercontent.com/ChrisYounger/sunburst_viz/master/static/formatting.png)






## Third party software

The following third-party libraries are used by this app. Thank you!

* jQuery - MIT - https://jquery.com/
* D3 - BSD 3-Clause - https://d3js.org/
* Font Awesome - Creative Commons Attribution-ShareAlike 4.0 License - https://fontawesome.com/


