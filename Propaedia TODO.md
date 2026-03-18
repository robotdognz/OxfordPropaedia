Propaedia TODO:

    - Need to create a proper well structured final AI pipline step that ensures that there is a match for every subsection. It should be of the same quality and thoughtfulness as the existing pipelines, and should be cleverly designed not to waste tokens, but also to get good results. Perhaps we should try programatically figuring out what books/articles should be mapped to each dead subsection and then just get the AI to write any rationales if we need them? Do a full review and audit first.
        - Run it for Wikipedia article, see if we have recomendations showing up for every nested subsection in the outline
    
    - Run full pipline on VSI's, they are using stale ai generated sorting / ranking data

    - Add BBC In Our Time podcast episodes to the database and mappings as well, would be good to have a different format in there
    
    - See if we can link the macropaedia articles to the current version on the britannica website (the current site was built from the articles these titles reference, so the mapping is possible, some of the online articles are sections of the larger print articles, so some clever web scraping and reconstruction will likely be required).

    - How hard would it be to do a more contextual search that can figure out what section you might be looking for? Keywords are quite limited feeling, especially in the context of exploring all mapped human knwoledge

    - Rename repo to DigitalPropaedia (or something better)