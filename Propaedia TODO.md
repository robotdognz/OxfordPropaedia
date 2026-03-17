Propaedia TODO:
    - Do you think it would be a good idea to add ratio buttons next to the three media types in the navigation bar, only one can be selected at a time, this selection is saved as user preference, it determines what kind of recomendations the user sees, rather than showing them all all the time

    - Lots of years are being picked up as hyper links to sections, we need to fix that
    - Need to do a full AI audit of the propaedia structure, and subsection names, there are still some odd anomalies in there

    - How hard would it be to do a more contextual search that can figure out what section you might be looking for? Keywords are quite limited feeling, especially in the context of exploring all mapped human knwoledge
        - Would also be great if the search results each showed what kind of page find it is rather than just having the name of the page at the top, so instead of "Molecules" it would say "Oxford VSI: Molecules" and section pages would have their number so "The Planet Earth" would become "211: The Planet Earth"

    - Need to create a proper well structured final AI pipline step that ensures that there is a match for every subsection. It should be of the same quality and thoughtfulness as the existing pipelines, and should be cleverly designed not to waste tokens, but also to get good results. Perhaps we should try programatically figuring out what books/articles should be mapped to each dead subsection and then just get the AI to write any rationales if we need them? Do a full review and audit first.
    
    - See if we can link the macropaedia articles to the current version on the britannica website (the current site was built from the articles these titles reference, so the mapping is possible, some of the online articles are sections of the larger print articles, so some clever web scraping and reconstruction will likely be required).
    - Have specific vsi recommendations when using the wheel with a center, recommend books based on sections and tags and don't show ones they have already read. It should probably be a tab choice at the top of this view (remember users chosen tab choice) that shows section recommendations using the current system, or VSI/Macropaedia/Wikipedia article recommendations. I guess it would need a Recommended Sections mode, and a Recommended Readings mode
    - Add BBC In Our Time podcast episodes to the database and mappings as well, would be good to have a different format in there
    - Button for random Section in side bar


AI Summary Scorecard:                                      
                                                                                                                                                            
  ┌──────────────────────┬───────┬────────────────────────────────────────────────────────┐
  │         Area         │ Grade │                         Notes                          │                                                                 
  ├──────────────────────┼───────┼────────────────────────────────────────────────────────┤                                                                 
  │ Concept & Vision     │ A     │ Genuinely novel and valuable                           │                                                                 
  ├──────────────────────┼───────┼────────────────────────────────────────────────────────┤                                                                 
  │ Data Pipeline        │ A-    │ Well-structured, but PDF parsing is inherently fragile │                                                                 
  ├──────────────────────┼───────┼────────────────────────────────────────────────────────┤                                                                 
  │ Content Architecture │ A     │ Zod schemas, clean separation, good data modeling      │                                                                 
  ├──────────────────────┼───────┼────────────────────────────────────────────────────────┤                                                                 
  │ AI Enrichment        │ B+    │ Powerful but not reproducible or reviewable            │
  ├──────────────────────┼───────┼────────────────────────────────────────────────────────┤                                                                 
  │ UI/UX Design         │ B     │ Clean but dense; needs better onboarding               │
  ├──────────────────────┼───────┼────────────────────────────────────────────────────────┤                                                                 
  │ Accessibility        │ A-    │ Strong foundations, minor gaps                         │
  ├──────────────────────┼───────┼────────────────────────────────────────────────────────┤                                                                 
  │ Performance          │ A     │ Static generation + Preact + service worker            │
  ├──────────────────────┼───────┼────────────────────────────────────────────────────────┤                                                                 
  │ Code Quality         │ B     │ TypeScript strict, but zero tests, no linting          │
  ├──────────────────────┼───────┼────────────────────────────────────────────────────────┤                                                                 
  │ DevOps/CI            │ B-    │ Deploys work, but no quality gates                     │
  ├──────────────────────┼───────┼────────────────────────────────────────────────────────┤                                                                 
  │ Documentation        │ B     │ README exists but no architecture docs                 │
  └──────────────────────┴───────┴────────────────────────────────────────────────────────┘                                                                 
                                                            
  Top 5 Recommended Improvements                                                                                                                            
                                                            
  1. Add onboarding/guided entry — a "Start exploring" flow or featured sections for new users                                                              
  2. Add next/previous section navigation — let users browse sequentially without backtracking
  3. Add basic test coverage — at least E2E tests for critical paths (search, navigation, outline filtering)                                                
  4. Add ESLint + Prettier — enforce consistency as the codebase grows                                                                                      
  5. Audit the wikipedia-catalog.json payload — ensure it's not shipped to the client at full size; consider splitting or lazy-loading 