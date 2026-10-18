export const REPEATING_LINEAR = `{pop
dup truncate sub
dup 0 le {1 add} if
dup 0 le {pop .8784 .1882 .1882 0} if
dup dup 0 gt exch 1 le and {
dup .5 le {
0 sub pop .8784 .1882 .1882 
}{
.5 sub pop .1882 .1882 .8784 
} ifelse
0} if
0 gt {.1882 .1882 .8784} if
}`

export const CONIC = `{exch atan 360 div
dup 0 le {pop 1 0 0 0} if
dup dup 0 gt exch 1 le and {
dup .5 le {
dup .166666672 le {
0 sub 1 exch 6 mul 0 
}{
dup .33333334 le {
.166666672 sub -6 mul 1 add 1 0 
}{
.33333334 sub 0 exch 1 exch 6.0000005 mul 
} ifelse
} ifelse
}{
dup .66666669 le {
.5 sub 0 exch -5.9999995 mul 1 add 1 
}{
dup .83333331 le {
.66666669 sub 6.0000014 mul 0 1 
}{
.83333331 sub 1 exch 0 exch -5.9999995 mul 1 add 
} ifelse
} ifelse
} ifelse
0} if
0 gt {1 0 0} if
}`
